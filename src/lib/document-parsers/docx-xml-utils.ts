import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

/**
 * Low-level helpers for reading the OOXML (.docx) package: turns
 * word/document.xml into an ordered list of paragraph/table "blocks" with
 * their text and any embedded images resolved to actual media bytes.
 * Kept generic (not tied to one letter template) so future document-type
 * parsers can reuse it — see ./registry.ts.
 */

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: false,
});

function tagName(node: XmlNode): string | null {
  const keys = Object.keys(node).filter((k) => k !== ":@");
  return (keys[0] as string) ?? null;
}

function children(node: XmlNode): XmlNode[] {
  const t = tagName(node);
  if (!t) return [];
  const val = (node as Record<string, unknown>)[t];
  return Array.isArray(val) ? (val as XmlNode[]) : [];
}

function attrs(node: XmlNode): Record<string, string> {
  return ((node[":@"] as Record<string, string>) ?? {}) as Record<
    string,
    string
  >;
}

function textOf(node: XmlNode): string {
  const t = tagName(node);
  if (t === "#text") {
    return String((node as Record<string, unknown>)["#text"] ?? "");
  }
  if (t === "w:br" || t === "w:cr") return "\n";
  if (t === "w:tab") return "\t";
  let out = "";
  for (const c of children(node)) out += textOf(c);
  return out;
}

function collectImageRIds(node: XmlNode, out: string[]) {
  const t = tagName(node);
  if (t === "a:blip") {
    const a = attrs(node);
    const embed = a["@_r:embed"] || a["@_r:link"];
    if (embed) out.push(embed);
  }
  for (const c of children(node)) collectImageRIds(c, out);
}

export interface DocBlockParagraph {
  type: "paragraph";
  text: string;
  imageRIds: string[];
}

export interface DocBlockTableCell {
  text: string;
  imageRIds: string[];
}

export interface DocBlockTable {
  type: "table";
  rows: DocBlockTableCell[][];
}

export type DocBlock = DocBlockParagraph | DocBlockTable;

function paragraphToBlock(node: XmlNode): DocBlockParagraph {
  const imageRIds: string[] = [];
  collectImageRIds(node, imageRIds);
  return { type: "paragraph", text: textOf(node).trim(), imageRIds };
}

function tableToBlock(node: XmlNode): DocBlockTable {
  const rows: DocBlockTableCell[][] = [];
  for (const child of children(node)) {
    if (tagName(child) !== "w:tr") continue;
    const cells: DocBlockTableCell[] = [];
    for (const tc of children(child)) {
      if (tagName(tc) !== "w:tc") continue;
      const imageRIds: string[] = [];
      collectImageRIds(tc, imageRIds);
      cells.push({ text: textOf(tc).trim(), imageRIds });
    }
    rows.push(cells);
  }
  return { type: "table", rows };
}

/** Parsed document.xml body as an ordered list of paragraph/table blocks. */
export function extractBlocks(documentXml: string): DocBlock[] {
  const tree = parser.parse(documentXml) as XmlNode[];
  const blocks: DocBlock[] = [];

  function walk(nodes: XmlNode[]) {
    for (const node of nodes) {
      const t = tagName(node);
      if (t === "w:p") {
        blocks.push(paragraphToBlock(node));
      } else if (t === "w:tbl") {
        blocks.push(tableToBlock(node));
      } else {
        // recurse into wrapper elements (w:document, w:body, sectPr holders, etc.)
        walk(children(node));
      }
    }
  }

  walk(tree);
  return blocks;
}

/** rId -> target path (e.g. "media/image1.png") from a .rels file. */
export function parseRelsMap(relsXml: string): Record<string, string> {
  const tree = parser.parse(relsXml) as XmlNode[];
  const map: Record<string, string> = {};

  function walk(nodes: XmlNode[]) {
    for (const node of nodes) {
      const t = tagName(node);
      if (t === "Relationship") {
        const a = attrs(node);
        if (a["@_Id"] && a["@_Target"]) {
          map[a["@_Id"]] = a["@_Target"];
        }
      }
      walk(children(node));
    }
  }

  walk(tree);
  return map;
}

export interface LoadedDocx {
  blocks: DocBlock[];
  /** rId -> raw media bytes + a best-effort content type */
  media: Map<string, { data: Buffer; contentType: string }>;
}

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

export async function loadDocx(fileBuffer: Buffer): Promise<LoadedDocx> {
  const zip = await JSZip.loadAsync(fileBuffer);

  const documentXmlFile = zip.file("word/document.xml");
  if (!documentXmlFile) {
    throw new Error("El archivo no parece ser un .docx válido (falta word/document.xml)");
  }
  const documentXml = await documentXmlFile.async("string");
  const blocks = extractBlocks(documentXml);

  const relsFile = zip.file("word/_rels/document.xml.rels");
  const relsMap = relsFile
    ? parseRelsMap(await relsFile.async("string"))
    : {};

  const media = new Map<string, { data: Buffer; contentType: string }>();
  for (const [rId, target] of Object.entries(relsMap)) {
    if (!target.startsWith("media/")) continue;
    const zipPath = `word/${target}`;
    const file = zip.file(zipPath);
    if (!file) continue;
    const data = await file.async("nodebuffer");
    const ext = target.split(".").pop()?.toLowerCase() ?? "";
    const contentType = EXT_CONTENT_TYPES[ext] ?? "application/octet-stream";
    media.set(rId, { data, contentType });
  }

  return { blocks, media };
}

/** Parses a Chilean-style number ("28,50" or "1.234,50") into a JS number. */
export function parseChileanNumber(raw: string): number {
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned) return 0;
  // Thousands separator "." + decimal "," -> strip dots, replace comma with dot
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

const SPANISH_MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/** Parses "Santiago, 10 de Junio de 2026" style dates into ISO (YYYY-MM-DD). */
export function parseSpanishLongDate(
  text: string
): { city?: string; iso?: string } {
  const match = text.match(
    /([A-ZÁÉÍÓÚÑa-záéíóúñ ]+),?\s*(\d{1,2})\s+de\s+([A-Za-záéíóúñ]+)\s+de\s+(\d{4})/
  );
  if (!match) return {};
  const [, city, day, monthName, year] = match;
  const month = SPANISH_MONTHS[monthName.toLowerCase()];
  if (!month) return { city: city.trim() };
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(
    Number(day)
  ).padStart(2, "0")}`;
  return { city: city.trim(), iso };
}
