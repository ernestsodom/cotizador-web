import { DocxEditor } from "@/lib/docx-template/docx-editor";
import { findAll, type XmlElement } from "@/lib/docx-template/xml-tree";
import { formatChileanNumber } from "@/lib/document-parsers/text-utils";
import { formatDateEs } from "@/lib/format";
import { imageAspect } from "./image-utils";
import type { QuoteRenderer, RenderQuoteInput, RenderItem, RenderImage } from "./types";

/**
 * Renders a quote by editing the original .docx in place rather than
 * rebuilding it. Everything the user did not change — typography, the
 * Proexsi/Besttech letterhead, page setup, the footer, section artwork —
 * comes out exactly as in the source document, because those bytes are
 * never touched.
 */

function extensionFor(contentType: string): string {
  if (/jpe?g/.test(contentType)) return "jpg";
  if (/gif/.test(contentType)) return "gif";
  return "png";
}

/** media target -> the drawings that display it, in document order. */
function indexDrawingsByMedia(
  ed: DocxEditor
): Map<string, { drawing: XmlElement; block: number }[]> {
  const rels = ed.relationships();
  const map = new Map<string, { drawing: XmlElement; block: number }[]>();
  ed.blocks().forEach((block, blockIndex) => {
    for (const drawing of ed.drawingsIn(block)) {
      const blip = findAll(drawing, "a:blip")[0];
      if (!blip) continue;
      const raw = ed.rawSlice(blip.start, blip.selfClosing ? blip.end : blip.innerStart);
      const rid = raw.match(/r:embed="([^"]+)"/)?.[1];
      const target = rid ? rels[rid] : undefined;
      if (!target) continue;
      const list = map.get(target) ?? [];
      list.push({ drawing, block: blockIndex });
      map.set(target, list);
    }
  });
  return map;
}

function priceCellText(item: RenderItem): string {
  const total = item.unitPrice * (item.quantity || 1);
  return formatChileanNumber(total);
}

function nameCellText(item: RenderItem): string {
  const qty = item.quantity || 1;
  return qty === 1 ? item.name : `${item.name} (x${qty})`;
}

async function generateDocx(input: RenderQuoteInput): Promise<Buffer> {
  if (!input.templateDocx) {
    throw new Error(
      "Este formato necesita el documento original. Vuelve a crear la cotización desde un documento cargado."
    );
  }

  const ed = await DocxEditor.load(input.templateDocx);
  const blocks = ed.blocks();
  const anchors = input.anchors ?? {};
  const at = (i: number | undefined | null) =>
    i !== undefined && i !== null && i >= 0 && i < blocks.length ? blocks[i] : null;

  const titleP = at(anchors.titleBlock);
  const subtitleP = at(anchors.subtitleBlock);
  const dateP = at(anchors.dateBlock);
  const letterNumberP = at(anchors.letterNumberBlock);
  const recipientP = at(anchors.recipientNameBlock);
  const institutionP = at(anchors.recipientInstitutionBlock);
  const signNameP = at(anchors.signatureNameBlock);
  const signPosP = at(anchors.signaturePositionBlock);

  // ---- find-and-replace of running text (e.g. the client's name), before
  // any targeted writes so the two mechanisms never touch the same run.
  // Anchored fields get the exact new value directly, below; everything
  // else in the letter body (intro, section text, terms, considerations)
  // is swept here instead. Sections belonging to excluded items are also
  // skipped when they're about to be deleted wholesale — editing text
  // inside a range and then removing that same range crashes the splice
  // writer, since the two edits would overlap.
  const sweepSkip = new Set<XmlElement>(
    [titleP, subtitleP, dateP, letterNumberP, recipientP, institutionP, signNameP, signPosP].filter(
      (p): p is XmlElement => !!p
    )
  );
  if (input.removeExcludedSections !== false) {
    for (const item of input.excludedItems ?? []) {
      if (item.sectionStartBlock == null || item.sectionEndBlock == null) continue;
      for (let i = item.sectionStartBlock; i <= item.sectionEndBlock; i++) {
        const b = blocks[i];
        if (b) sweepSkip.add(b);
      }
    }
  }
  ed.replaceTextEverywhere(input.textReplacements ?? [], sweepSkip);

  // ---- cover ----
  const drawingsByMedia = indexDrawingsByMedia(ed);
  const coverLogo = at(anchors.coverLogoBlock);
  if (coverLogo && input.logo) {
    replaceFirstDrawingImage(ed, coverLogo, input.logo);
  }
  const coverArt = at(anchors.coverImageBlock);
  if (coverArt && input.coverImage) {
    replaceFirstDrawingImage(ed, coverArt, input.coverImage);
  }

  if (titleP && input.title) ed.setParagraphText(titleP, input.title);
  if (subtitleP && input.subtitle) ed.setParagraphText(subtitleP, input.subtitle);

  // ---- letter head ----
  if (dateP) {
    const city = input.letterCity?.trim();
    const dateText = formatDateEs(input.letterDateIso);
    ed.setParagraphText(dateP, city ? `${city}, ${dateText}. ` : `${dateText}. `);
  }

  if (letterNumberP && input.letterNumber) {
    ed.setParagraphText(letterNumberP, input.letterNumber);
  }

  if (recipientP) {
    const lines = [input.recipientName ?? "", input.recipientPosition ?? ""].filter(Boolean);
    if (lines.length) ed.setParagraphLines(recipientP, lines);
  }

  if (institutionP && input.recipientInstitution) {
    ed.setParagraphText(institutionP, input.recipientInstitution);
  }

  // ---- signature ----
  if (signNameP && input.signatoryName) ed.setParagraphText(signNameP, input.signatoryName);
  if (signPosP && input.signatoryPosition) ed.setParagraphText(signPosP, input.signatoryPosition);

  // ---- pricing table ----
  const tbl = at(anchors.tableBlock);
  if (tbl) {
    const rows = ed.rows(tbl);

    // rows that stay, edited in place
    let lastKeptRow: XmlElement | null = rows[0] ?? null;
    let templateRow: XmlElement | null = null;
    for (const item of input.items) {
      const row = item.tableRowIndex != null ? rows[item.tableRowIndex] : undefined;
      if (!row) continue;
      templateRow = templateRow ?? row;
      const cells = ed.cells(row);
      if (cells.length >= 2) {
        ed.setCellText(cells[0], nameCellText(item));
        ed.setCellText(cells[cells.length - 1], priceCellText(item));
      }
      lastKeptRow = row;
    }

    // rows for items the user unchecked
    for (const item of input.excludedItems ?? []) {
      const row = item.tableRowIndex != null ? rows[item.tableRowIndex] : undefined;
      if (row) ed.remove(row);
    }

    // items the user added by hand: clone the styling of an existing row
    const added = input.items.filter((i) => i.tableRowIndex == null);
    const source = templateRow ?? rows[1] ?? null;
    if (source && lastKeptRow) {
      for (const item of added) {
        const cellCount = ed.cells(source).length;
        const texts = new Array(cellCount).fill("");
        texts[0] = nameCellText(item);
        texts[cellCount - 1] = priceCellText(item);
        ed.cloneRowAfter(source, lastKeptRow, texts);
      }
    }
  }

  // ---- section artwork ----
  for (const item of input.items) {
    applyItemPhotos(ed, item, drawingsByMedia);
  }

  // ---- descriptive sections of excluded items ----
  if (input.removeExcludedSections !== false) {
    for (const item of input.excludedItems ?? []) {
      const from = at(item.sectionStartBlock);
      const to = at(item.sectionEndBlock);
      if (from && to && (item.sectionEndBlock ?? 0) >= (item.sectionStartBlock ?? 0)) {
        ed.removeRange(from, to);
      }
    }
  }

  return ed.save();
}

function replaceFirstDrawingImage(ed: DocxEditor, block: XmlElement, image: RenderImage): void {
  const rels = ed.relationships();
  const drawings = ed.drawingsIn(block);
  if (drawings.length === 0) return;

  const targets = new Set<string>();
  for (const drawing of drawings) {
    const blip = findAll(drawing, "a:blip")[0];
    if (!blip) continue;
    const raw = ed.rawSlice(blip.start, blip.selfClosing ? blip.end : blip.innerStart);
    const rid = raw.match(/r:embed="([^"]+)"/)?.[1];
    const target = rid ? rels[rid] : undefined;
    if (target) targets.add(target);
  }
  // the cover art is drawn twice against the same media part; replacing the
  // bytes updates every reference at once and keeps the original geometry
  for (const target of targets) {
    ed.replaceMedia(target, image.data);
    break;
  }
  // the uploaded logo/cover rarely shares the original's proportions —
  // refit every drawing on this block so it isn't stretched into a frame
  // sized for a different-shaped picture.
  const aspect = imageAspect(image.data);
  if (aspect) {
    for (const drawing of drawings) ed.resizeDrawingToAspect(drawing, aspect);
  }
}

/**
 * Reconciles an item's chosen photos against the slots it occupies in the
 * template. Matching is done by `sourceMediaTarget`, not by array position:
 * an item's photo list can have a new upload inserted or removed from the
 * middle, which would shift every position after it, so pairing photo[i]
 * with slot[i] silently pushed the wrong bytes into the wrong frame — one
 * way the "se descuadran" complaint showed up even for photos the user
 * never touched. A photo whose sourceMediaTarget still matches one of the
 * item's own slots keeps that slot untouched (byte-identical); everything
 * else — reorders included — is treated as a change and fills the
 * remaining slots in order, refitting each frame to the new picture's own
 * proportions so it isn't stretched into a box sized for a different one.
 */
function applyItemPhotos(
  ed: DocxEditor,
  item: RenderItem,
  drawingsByMedia: Map<string, { drawing: XmlElement; block: number }[]>
): void {
  const slots = (item.templatePhotoTargets ?? [])
    .map((target) => {
      const entry = drawingsByMedia.get(target)?.[0];
      return entry ? { target, drawing: entry.drawing } : null;
    })
    .filter((s): s is { target: string; drawing: XmlElement } => !!s);

  if (slots.length === 0) return;

  const photos = item.photos ?? [];
  const usedPhoto = new Set<number>();
  const usedSlot = new Set<number>();

  // pass 1: keep byte-identical any photo still referencing one of this
  // item's own slots.
  slots.forEach((slot, si) => {
    const pi = photos.findIndex(
      (p, i) => !usedPhoto.has(i) && p.sourceMediaTarget && p.sourceMediaTarget === slot.target
    );
    if (pi !== -1) {
      usedSlot.add(si);
      usedPhoto.add(pi);
    }
  });

  const leftoverPhotos = photos.map((_, i) => i).filter((i) => !usedPhoto.has(i));
  const emptySlots = slots.map((_, i) => i).filter((i) => !usedSlot.has(i));

  // pass 2: fill the now-empty slots, in order, with whatever photos are
  // left — new uploads, or originals reordered away from their own slot.
  let li = 0;
  for (const si of emptySlots) {
    const slot = slots[si];
    if (li >= leftoverPhotos.length) {
      ed.remove(slot.drawing);
      continue;
    }
    const photo = photos[leftoverPhotos[li++]];
    ed.replaceMedia(slot.target, photo.data);
    ed.resizeDrawingToAspect(slot.drawing, imageAspect(photo.data));
  }

  // pass 3: more photos than the template had slots for — append them,
  // sized to their own proportions rather than the anchor's box.
  if (li < leftoverPhotos.length) {
    const anchorDrawing = slots[slots.length - 1].drawing;
    for (; li < leftoverPhotos.length; li++) {
      const photo = photos[leftoverPhotos[li]];
      const relId = ed.addMedia(photo.data, extensionFor(photo.contentType));
      ed.cloneDrawingAfter(anchorDrawing, relId, imageAspect(photo.data) ?? undefined);
    }
  }
}

export const reutilityReplicaV1: QuoteRenderer = {
  key: "reutility_replica_v1",
  name: "Réplica exacta del documento original",
  requiresTemplate: true,
  generateDocx,
};
