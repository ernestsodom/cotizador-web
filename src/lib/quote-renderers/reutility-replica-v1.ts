import { DocxEditor } from "@/lib/docx-template/docx-editor";
import { findAll, type XmlElement } from "@/lib/docx-template/xml-tree";
import { formatChileanNumber } from "@/lib/document-parsers/text-utils";
import { formatDateEs } from "@/lib/format";
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

  const titleP = at(anchors.titleBlock);
  if (titleP && input.title) ed.setParagraphText(titleP, input.title);

  const subtitleP = at(anchors.subtitleBlock);
  if (subtitleP && input.subtitle) ed.setParagraphText(subtitleP, input.subtitle);

  // ---- letter head ----
  const dateP = at(anchors.dateBlock);
  if (dateP) {
    const city = input.letterCity?.trim();
    const dateText = formatDateEs(input.letterDateIso);
    ed.setParagraphText(dateP, city ? `${city}, ${dateText}. ` : `${dateText}. `);
  }

  const letterNumberP = at(anchors.letterNumberBlock);
  if (letterNumberP && input.letterNumber) {
    ed.setParagraphText(letterNumberP, input.letterNumber);
  }

  const recipientP = at(anchors.recipientNameBlock);
  if (recipientP) {
    const lines = [input.recipientName ?? "", input.recipientPosition ?? ""].filter(Boolean);
    if (lines.length) ed.setParagraphLines(recipientP, lines);
  }

  const institutionP = at(anchors.recipientInstitutionBlock);
  if (institutionP && input.recipientInstitution) {
    ed.setParagraphText(institutionP, input.recipientInstitution);
  }

  // ---- signature ----
  const signNameP = at(anchors.signatureNameBlock);
  if (signNameP && input.signatoryName) ed.setParagraphText(signNameP, input.signatoryName);
  const signPosP = at(anchors.signaturePositionBlock);
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
}

/**
 * Reconciles an item's chosen photos against the slots it occupies in the
 * template: untouched photos stay byte-identical, changed ones replace the
 * slot's bytes, removed ones drop the drawing, and extra ones are cloned
 * from the last slot so they inherit its size and anchoring.
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

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const photo = photos[i];
    if (!photo) {
      ed.remove(slot.drawing);
      continue;
    }
    if (photo.sourceMediaTarget === slot.target) continue; // unchanged
    ed.replaceMedia(slot.target, photo.data);
  }

  if (photos.length > slots.length) {
    const anchorDrawing = slots[slots.length - 1].drawing;
    for (let i = slots.length; i < photos.length; i++) {
      const relId = ed.addMedia(photos[i].data, extensionFor(photos[i].contentType));
      ed.cloneDrawingAfter(anchorDrawing, relId);
    }
  }
}

export const reutilityReplicaV1: QuoteRenderer = {
  key: "reutility_replica_v1",
  name: "Réplica exacta del documento original",
  requiresTemplate: true,
  generateDocx,
};
