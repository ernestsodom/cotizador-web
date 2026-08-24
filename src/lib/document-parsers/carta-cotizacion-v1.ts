import {
  loadDocx,
  parseChileanNumber,
  parseSpanishLongDate,
  type DocBlock,
} from "./docx-xml-utils";
import type { ParsedDocument, ParsedImage, ParsedItem, ParsedDocumentMeta } from "./types";

/**
 * Parser for "carta_cotizacion_v1": a formal commercial-proposal letter
 * (Word) addressed to a client, with a body of numbered service sections
 * (each with a short description and optional screenshots/photos),
 * followed by a pricing table ("COTIZACIÓN"), terms ("PLAZOS"), general
 * conditions ("CONSIDERACIONES") and a signature block.
 *
 * The parser is heuristic, not a strict template match — headings are
 * matched by keyword rather than exact position — so reasonably similar
 * letters should still parse usefully even if wording shifts a bit.
 */

const STOPWORDS = new Set([
  "de", "la", "el", "los", "las", "y", "en", "para", "con", "del", "un", "una",
  "a", "que", "por", "su", "al", "e", "o", "u", "punto", "puntos", "modulo",
  "módulo", "modulos", "módulos",
]);

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9\s.]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

interface SectionHeading {
  number: string; // e.g. "1.1"
  title: string;
  blockIndex: number;
}

function findSectionHeadings(blocks: DocBlock[]): SectionHeading[] {
  const headings: SectionHeading[] = [];
  blocks.forEach((b, i) => {
    if (b.type !== "paragraph") return;
    const m = b.text.match(/^(\d+\.\d+)\.\s*(.{3,120})/);
    if (m) {
      headings.push({ number: m[1], title: m[2].trim(), blockIndex: i });
    }
  });
  return headings;
}

export async function parseCartaCotizacionV1(
  fileBuffer: Buffer
): Promise<ParsedDocument> {
  const { blocks, media } = await loadDocx(fileBuffer);

  // ---- images: collect every embedded image once, in document order ----
  const images: ParsedImage[] = [];
  const seenRIds = new Set<string>();
  const rIdToImageKey = new Map<string, string>();

  const recipientBlockIndex = blocks.findIndex(
    (b) => b.type === "paragraph" && /^se(ñ|n)or(a)?$/i.test(b.text.trim())
  );

  blocks.forEach((block, blockIndex) => {
    const imageRIds =
      block.type === "paragraph"
        ? block.imageRIds
        : block.rows.flatMap((row) => row.flatMap((cell) => cell.imageRIds));
    for (const rId of imageRIds) {
      if (seenRIds.has(rId)) continue;
      const media_ = media.get(rId);
      if (!media_) continue;
      seenRIds.add(rId);
      const key = `img_${images.length + 1}`;
      rIdToImageKey.set(rId, key);
      images.push({
        key,
        data: media_.data,
        contentType: media_.contentType,
        isHeaderCandidate:
          recipientBlockIndex === -1 ? false : blockIndex < recipientBlockIndex,
      });
    }
  });

  // ---- section headings (for tagging images + matching items to descriptions) ----
  const headings = findSectionHeadings(blocks);

  function sectionForBlockIndex(blockIndex: number): SectionHeading | undefined {
    let current: SectionHeading | undefined;
    for (const h of headings) {
      if (h.blockIndex <= blockIndex) current = h;
      else break;
    }
    return current;
  }

  // tag each non-header image with the section it falls under, and collect
  // per-section image keys for later item matching
  const imagesBySection = new Map<string, string[]>();
  blocks.forEach((block, blockIndex) => {
    if (block.type !== "paragraph") return;
    if (block.imageRIds.length === 0) return;
    const section = sectionForBlockIndex(blockIndex);
    if (!section) return;
    for (const rId of block.imageRIds) {
      const key = rIdToImageKey.get(rId);
      if (!key) continue;
      const img = images.find((i) => i.key === key);
      if (img && !img.isHeaderCandidate) {
        img.sectionLabel = `${section.number} ${section.title}`;
        const list = imagesBySection.get(section.number) ?? [];
        list.push(key);
        imagesBySection.set(section.number, list);
      }
    }
  });

  // section description text: bullet lines following each heading, up to
  // the next heading (used as the default item description)
  const sectionDescriptions = new Map<string, string>();
  headings.forEach((h, idx) => {
    const nextIndex = headings[idx + 1]?.blockIndex ?? blocks.length;
    const lines: string[] = [];
    for (let i = h.blockIndex + 1; i < nextIndex; i++) {
      const b = blocks[i];
      if (b.type === "paragraph" && b.text) lines.push(b.text);
    }
    sectionDescriptions.set(h.number, lines.join("\n"));
  });

  // ---- pricing table: first table under a heading mentioning "cotiza" ----
  let quoteHeadingIndex = blocks.findIndex(
    (b) => b.type === "paragraph" && /cotiza/i.test(b.text) && b.text.length < 60
  );
  let tableBlockIndex = -1;
  for (let i = Math.max(quoteHeadingIndex, 0); i < blocks.length; i++) {
    if (blocks[i].type === "table") {
      tableBlockIndex = i;
      break;
    }
  }
  // fallback: last table in the document (many letters only have the pricing table)
  if (tableBlockIndex === -1) {
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].type === "table") {
        tableBlockIndex = i;
        break;
      }
    }
  }

  const items: ParsedItem[] = [];
  if (tableBlockIndex !== -1) {
    const table = blocks[tableBlockIndex];
    if (table.type === "table") {
      const headerRow = table.rows[0];
      const headerText = headerRow?.map((c) => c.text).join(" ") ?? "";
      const currency = /uf\b/i.test(headerText)
        ? "UF"
        : /\$|clp|pesos/i.test(headerText)
        ? "CLP"
        : "CLP";

      for (const row of table.rows.slice(1)) {
        if (row.length < 2) continue;
        const name = row[0]?.text?.trim();
        const priceText = row[row.length - 1]?.text?.trim();
        if (!name || !priceText) continue;
        const unitPrice = parseChileanNumber(priceText);

        // 1) explicit section refs mentioned in the item name, e.g. "(1.2. +1.3.)"
        const refs = Array.from(name.matchAll(/\d+\.\d+/g)).map((m) => m[0]);
        let matchedSections = refs;

        // 2) fallback: word-overlap against section headings
        if (matchedSections.length === 0) {
          const nameWords = new Set(normalizeWords(name));
          let best: { number: string; score: number } | null = null;
          for (const h of headings) {
            const titleWords = new Set(normalizeWords(h.title));
            let overlap = 0;
            for (const w of nameWords) if (titleWords.has(w)) overlap++;
            if (overlap >= 2 && (!best || overlap > best.score)) {
              best = { number: h.number, score: overlap };
            }
          }
          if (best) matchedSections = [best.number];
        }

        const suggested = new Set<string>();
        const descriptionParts: string[] = [];
        for (const ref of matchedSections) {
          for (const key of imagesBySection.get(ref) ?? []) suggested.add(key);
          const d = sectionDescriptions.get(ref);
          if (d) descriptionParts.push(d);
        }

        items.push({
          name,
          description: descriptionParts.join("\n\n") || undefined,
          quantity: 1,
          unitPrice,
          currency,
          suggestedImageKeys: Array.from(suggested),
        });
      }
    }
  }

  // ---- letter metadata ----
  const meta: ParsedDocumentMeta = {};

  const dateBlock = blocks.find(
    (b) => b.type === "paragraph" && /\d{4}/.test(b.text) && /de\s+\d{4}/i.test(b.text)
  );
  if (dateBlock && dateBlock.type === "paragraph") {
    const { city, iso } = parseSpanishLongDate(dateBlock.text);
    meta.letterCity = city;
    meta.letterDateIso = iso;
  }

  if (recipientBlockIndex !== -1) {
    const nameBlock = blocks[recipientBlockIndex + 1];
    const institutionBlock = blocks[recipientBlockIndex + 2];
    if (nameBlock?.type === "paragraph") {
      const [first, ...rest] = nameBlock.text.split("\n").map((s) => s.trim()).filter(Boolean);
      meta.recipientName = first;
      if (rest.length) meta.recipientPosition = rest.join(" ");
    }
    if (institutionBlock?.type === "paragraph") {
      meta.recipientInstitution = institutionBlock.text.trim();
      meta.clientNameGuess = institutionBlock.text.trim();
    }

    // letter number: short paragraph right before the recipient block that
    // isn't the date itself (e.g. "/P.26")
    for (let i = recipientBlockIndex - 1; i >= 0; i--) {
      const b = blocks[i];
      if (b.type !== "paragraph" || !b.text) continue;
      if (b === dateBlock) break;
      if (b.text.length <= 20) meta.letterNumber = b.text.trim();
      break;
    }
  }

  const introIndex = blocks.findIndex(
    (b) => b.type === "paragraph" && /de nuestra consideraci/i.test(b.text)
  );
  if (introIndex !== -1) {
    const introParas: string[] = [];
    for (let i = introIndex + 1; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.type === "paragraph" && b.text) {
        if (/^item\s*1/i.test(b.text) || headings.some((h) => h.blockIndex === i)) break;
        introParas.push(b.text);
      } else if (b.type === "table") break;
    }
    meta.introText = introParas.join("\n\n") || undefined;
  }

  const plazosIndex = blocks.findIndex(
    (b) => b.type === "paragraph" && /^plazos$/i.test(b.text.trim())
  );
  const considerationsIndex = blocks.findIndex(
    (b) => b.type === "paragraph" && /^consideraciones$/i.test(b.text.trim())
  );
  const closingIndex = blocks.findIndex(
    (b) => b.type === "paragraph" && /despide atentamente/i.test(b.text)
  );

  if (plazosIndex !== -1) {
    const end = considerationsIndex !== -1 ? considerationsIndex : blocks.length;
    meta.termsText = blocks
      .slice(plazosIndex + 1, end)
      .filter((b): b is Extract<DocBlock, { type: "paragraph" }> => b.type === "paragraph")
      .map((b) => b.text)
      .filter(Boolean);
  }

  if (considerationsIndex !== -1) {
    const end = closingIndex !== -1 ? closingIndex : blocks.length;
    meta.considerationsText = blocks
      .slice(considerationsIndex + 1, end)
      .filter((b): b is Extract<DocBlock, { type: "paragraph" }> => b.type === "paragraph")
      .map((b) => b.text)
      .filter(Boolean);
  }

  if (closingIndex !== -1) {
    const closingBlock = blocks[closingIndex];
    meta.closingText = closingBlock.type === "paragraph" ? closingBlock.text : undefined;

    // signature block: skip a divider line of underscores/dashes, then
    // name, position, company
    const rest = blocks
      .slice(closingIndex + 1)
      .filter((b): b is Extract<DocBlock, { type: "paragraph" }> => b.type === "paragraph")
      .map((b) => b.text)
      .filter(Boolean)
      .filter((t) => !/^[_\-—\s]{3,}$/.test(t));

    if (rest[0]) meta.signatoryName = rest[0];
    if (rest[1]) meta.signatoryPosition = rest[1];
    if (rest[2]) meta.signatoryCompany = rest[2];
  }

  return { meta, items, images };
}
