import { DocxEditor } from "@/lib/docx-template/docx-editor";
import { findAll } from "@/lib/docx-template/xml-tree";
import {
  parseChileanNumber,
  parseSpanishLongDate,
  contentWords,
} from "./text-utils";
import type {
  ParsedDocument,
  ParsedImage,
  ParsedItem,
  ParsedDocumentMeta,
  ParsedAnchors,
} from "./types";

/**
 * Parser for "carta_cotizacion_v1": a formal commercial-proposal letter
 * (Word) with a cover page, numbered service sections (each with a short
 * description and optional screenshots), a pricing table ("COTIZACIÓN"),
 * terms, general conditions and a signature block.
 *
 * Besides extracting the data, it records *anchors* — body-block indices
 * for every editable piece — so the replica renderer can write new values
 * back into this very document without rebuilding it. Headings are matched
 * by keyword rather than fixed position, so similar letters still parse.
 */

const EXT_CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  emf: "image/x-emf",
  wmf: "image/x-wmf",
};

interface Section {
  number: string;
  title: string;
  block: number;
  endBlock: number;
}

export async function parseCartaCotizacionV1(
  fileBuffer: Buffer
): Promise<ParsedDocument> {
  const ed = await DocxEditor.load(fileBuffer);
  const blocks = ed.blocks();
  const rels = ed.relationships();
  const zip = await import("jszip").then((m) => m.default.loadAsync(fileBuffer));

  const isP = (i: number) => blocks[i]?.name === "w:p";
  const text = (i: number) => (blocks[i] ? ed.text(blocks[i]).trim() : "");

  // ---- locate the structural landmarks first ----
  const recipientBlock = blocks.findIndex(
    (b, i) => isP(i) && /^se(ñ|n)or(a|es)?\.?$/i.test(ed.text(b).trim())
  );
  const tableBlock = blocks.findIndex((b) => b.name === "w:tbl");
  const quoteHeadingBlock = blocks.findIndex(
    (b, i) => isP(i) && /^cotizaci[óo]n$/i.test(ed.text(b).trim())
  );
  const sectionsEndBlock =
    quoteHeadingBlock !== -1 ? quoteHeadingBlock : tableBlock !== -1 ? tableBlock : blocks.length;

  // ---- section headings ("1.1. ADMINISTRACIÓN...") ----
  const sections: Section[] = [];
  blocks.forEach((b, i) => {
    if (!isP(i)) return;
    const m = ed.text(b).trim().match(/^(\d+\.\d+)\.?\s*(.{3,140})$/);
    if (m) sections.push({ number: m[1], title: m[2].trim(), block: i, endBlock: i });
  });
  sections.forEach((s, idx) => {
    s.endBlock = (sections[idx + 1]?.block ?? sectionsEndBlock) - 1;
  });

  function sectionAt(blockIndex: number): Section | undefined {
    let current: Section | undefined;
    for (const s of sections) {
      if (s.block <= blockIndex) current = s;
      else break;
    }
    return current;
  }

  // ---- images, in document order, with their template anchors ----
  const images: ParsedImage[] = [];
  const imagesBySection = new Map<string, string[]>();

  for (let i = 0; i < blocks.length; i++) {
    const drawings = ed.drawingsIn(blocks[i]);
    if (drawings.length === 0) continue;
    const seenHere = new Set<string>();

    for (const drawing of drawings) {
      const blip = findAll(drawing, "a:blip")[0];
      if (!blip) continue;
      const raw = ed.rawSlice(blip.start, blip.selfClosing ? blip.end : blip.innerStart);
      const rid = raw.match(/r:embed="([^"]+)"/)?.[1];
      if (!rid) continue;
      const target = rels[rid];
      if (!target || !target.startsWith("media/")) continue;
      if (seenHere.has(target)) continue; // the cover art is drawn twice
      seenHere.add(target);

      const file = zip.file(`word/${target}`);
      if (!file) continue;
      const data = await file.async("nodebuffer");
      const ext = target.split(".").pop()?.toLowerCase() ?? "";

      const isHeaderCandidate = recipientBlock !== -1 && i < recipientBlock;
      const section = isHeaderCandidate ? undefined : sectionAt(i);
      const key = `img_${images.length + 1}`;

      images.push({
        key,
        data,
        contentType: EXT_CONTENT_TYPES[ext] ?? "application/octet-stream",
        isHeaderCandidate,
        sectionLabel: section ? `${section.number} ${section.title}` : undefined,
        mediaTarget: target,
        blockIndex: i,
      });

      if (section) {
        const list = imagesBySection.get(section.number) ?? [];
        list.push(key);
        imagesBySection.set(section.number, list);
      }
    }
  }

  // ---- per-section descriptive text (default item description) ----
  const sectionDescriptions = new Map<string, string>();
  for (const s of sections) {
    const lines: string[] = [];
    for (let i = s.block + 1; i <= s.endBlock && i < blocks.length; i++) {
      if (!isP(i)) continue;
      const t = ed.text(blocks[i]).trim();
      if (t) lines.push(t);
    }
    sectionDescriptions.set(s.number, lines.join("\n"));
  }

  /**
   * Resolves which descriptive sections an item refers to. Explicit
   * references in the item name win, but the source letters sometimes cite
   * the wrong number, so when the cited section has no images we fall back
   * to the section whose heading best matches the item name.
   */
  function resolveSections(itemName: string): Section[] {
    const refs = Array.from(itemName.matchAll(/\d+\.\d+/g)).map((m) => m[0]);
    const byRef = refs
      .map((r) => sections.find((s) => s.number === r))
      .filter((s): s is Section => !!s);

    const refsHaveImages = byRef.some((s) => (imagesBySection.get(s.number) ?? []).length > 0);
    if (byRef.length > 0 && refsHaveImages) return byRef;

    const nameWords = new Set(contentWords(itemName));
    let best: { section: Section; score: number } | null = null;
    for (const s of sections) {
      const titleWords = contentWords(s.title);
      if (titleWords.length === 0) continue;
      let overlap = 0;
      for (const w of titleWords) if (nameWords.has(w)) overlap++;
      if (overlap >= 2 && (!best || overlap > best.score)) best = { section: s, score: overlap };
    }
    if (best) return [best.section];
    return byRef;
  }

  // ---- pricing table ----
  const items: ParsedItem[] = [];
  if (tableBlock !== -1) {
    const tbl = blocks[tableBlock];
    const rows = ed.rows(tbl);
    const headerText = rows[0] ? ed.cells(rows[0]).map((c) => ed.text(c)).join(" ") : "";
    const currency = /uf\b/i.test(headerText) ? "UF" : "CLP";

    rows.forEach((row, rowIndex) => {
      if (rowIndex === 0) return; // header
      const cells = ed.cells(row);
      if (cells.length < 2) return;
      const name = ed.text(cells[0]).trim();
      const priceText = ed.text(cells[cells.length - 1]).trim();
      if (!name || !priceText) return;

      const resolved = resolveSections(name);
      const suggested: string[] = [];
      const descriptions: string[] = [];
      for (const s of resolved) {
        for (const k of imagesBySection.get(s.number) ?? []) suggested.push(k);
        const d = sectionDescriptions.get(s.number);
        if (d) descriptions.push(d);
      }

      items.push({
        name,
        description: descriptions.join("\n\n") || undefined,
        quantity: 1,
        unitPrice: parseChileanNumber(priceText),
        currency,
        suggestedImageKeys: suggested,
        tableRowIndex: rowIndex,
        sectionStartBlock: resolved.length ? Math.min(...resolved.map((s) => s.block)) : undefined,
        sectionEndBlock: resolved.length ? Math.max(...resolved.map((s) => s.endBlock)) : undefined,
      });
    });
  }

  // ---- letter metadata + anchors ----
  const meta: ParsedDocumentMeta = {};
  const anchors: ParsedAnchors = {};

  const coverImageBlocks = images
    .filter((i) => i.isHeaderCandidate)
    .map((i) => i.blockIndex);
  if (coverImageBlocks.length > 0) anchors.coverLogoBlock = coverImageBlocks[0];
  if (coverImageBlocks.length > 1) anchors.coverImageBlock = coverImageBlocks[1];

  const dateBlock = blocks.findIndex(
    (b, i) => isP(i) && /\d{1,2}\s+de\s+[A-Za-záéíóúñ]+\s+de\s+\d{4}/i.test(ed.text(b))
  );
  if (dateBlock !== -1) {
    anchors.dateBlock = dateBlock;
    const { city, iso } = parseSpanishLongDate(text(dateBlock));
    meta.letterCity = city;
    meta.letterDateIso = iso;
  }

  // title/subtitle: the last two non-empty paragraphs before the date line
  if (dateBlock > 0) {
    const before: number[] = [];
    for (let i = dateBlock - 1; i >= 0 && before.length < 2; i--) {
      if (isP(i) && text(i) && ed.drawingsIn(blocks[i]).length === 0) before.push(i);
    }
    if (before[1] !== undefined) {
      anchors.titleBlock = before[1];
      meta.title = text(before[1]);
    }
    if (before[0] !== undefined) {
      anchors.subtitleBlock = before[0];
      meta.subtitle = text(before[0]);
    }
  }

  if (recipientBlock !== -1) {
    const nameBlock = recipientBlock + 1;
    const institutionBlock = recipientBlock + 2;
    if (isP(nameBlock)) {
      anchors.recipientNameBlock = nameBlock;
      const lines = text(nameBlock).split("\n").map((s) => s.trim()).filter(Boolean);
      meta.recipientName = lines[0];
      if (lines.length > 1) meta.recipientPosition = lines.slice(1).join(" ");
    }
    if (isP(institutionBlock)) {
      anchors.recipientInstitutionBlock = institutionBlock;
      meta.recipientInstitution = text(institutionBlock);
      meta.clientNameGuess = text(institutionBlock);
    }

    // letter number: the short line between the date and the recipient
    for (let i = recipientBlock - 1; i > dateBlock; i--) {
      const t = text(i);
      if (!isP(i) || !t) continue;
      if (t.length <= 20) {
        anchors.letterNumberBlock = i;
        meta.letterNumber = t;
      }
      break;
    }
  }

  const introIndex = blocks.findIndex(
    (b, i) => isP(i) && /de nuestra consideraci/i.test(ed.text(b))
  );
  if (introIndex !== -1) {
    const paras: string[] = [];
    for (let i = introIndex + 1; i < blocks.length; i++) {
      if (blocks[i].name === "w:tbl") break;
      if (sections.some((s) => s.block === i)) break;
      const t = text(i);
      if (/^item\s*\d/i.test(t)) break;
      if (t) paras.push(t);
    }
    meta.introText = paras.join("\n\n") || undefined;
  }

  const plazosIndex = blocks.findIndex((b, i) => isP(i) && /^plazos$/i.test(ed.text(b).trim()));
  const considerationsIndex = blocks.findIndex(
    (b, i) => isP(i) && /^consideraciones$/i.test(ed.text(b).trim())
  );
  const closingIndex = blocks.findIndex((b, i) => isP(i) && /despide atentamente/i.test(ed.text(b)));

  const collect = (from: number, to: number) => {
    const out: string[] = [];
    for (let i = from; i < to && i < blocks.length; i++) {
      if (!isP(i)) continue;
      const t = text(i);
      if (t) out.push(t);
    }
    return out;
  };

  if (plazosIndex !== -1) {
    meta.termsText = collect(
      plazosIndex + 1,
      considerationsIndex !== -1 ? considerationsIndex : blocks.length
    );
  }
  if (considerationsIndex !== -1) {
    meta.considerationsText = collect(
      considerationsIndex + 1,
      closingIndex !== -1 ? closingIndex : blocks.length
    );
  }

  if (closingIndex !== -1) {
    meta.closingText = text(closingIndex);
    const rest: { block: number; text: string }[] = [];
    for (let i = closingIndex + 1; i < blocks.length; i++) {
      if (!isP(i)) continue;
      const t = text(i);
      if (!t || /^[_\-—\s]{3,}$/.test(t)) continue;
      rest.push({ block: i, text: t });
    }
    if (rest[0]) {
      meta.signatoryName = rest[0].text;
      anchors.signatureNameBlock = rest[0].block;
    }
    if (rest[1]) {
      meta.signatoryPosition = rest[1].text;
      anchors.signaturePositionBlock = rest[1].block;
    }
    if (rest[2]) meta.signatoryCompany = rest[2].text;
  }

  if (tableBlock !== -1) anchors.tableBlock = tableBlock;
  meta.anchors = anchors;

  return { meta, items, images };
}
