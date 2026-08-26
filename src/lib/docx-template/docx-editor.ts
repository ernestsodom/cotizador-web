import JSZip from "jszip";
import {
  indexXml,
  findAll,
  findAllOf,
  childrenNamed,
  textOf,
  escapeXml,
  applySplices,
  type XmlElement,
  type Splice,
} from "./xml-tree";

/**
 * Edits an existing .docx in place: everything the caller does not touch
 * comes out byte-identical, so fonts, styles, headers/footers, numbering
 * and page setup are preserved exactly. This is what lets the "replica"
 * quote format look identical to the document it was built from.
 */
/**
 * Given a drawing's current box (cx, cy, in EMU) and a new image's aspect
 * ratio (width/height), returns the largest box of that aspect ratio that
 * still fits inside the original one — same "contain" fit used for photos
 * placed fresh, so a replacement image is never stretched to a frame sized
 * for a differently-shaped picture. Returns null if the box can't be read.
 */
function fitExtent(cx: number, cy: number, aspect: number): { cx: number; cy: number } | null {
  if (!cx || !cy) return null;
  let newCx = cx;
  let newCy = Math.round(cx / aspect);
  if (newCy > cy) {
    newCy = cy;
    newCx = Math.round(cy * aspect);
  }
  return { cx: newCx, cy: newCy };
}

export class DocxEditor {
  private zip: JSZip;
  private xml: string;
  private root: XmlElement;
  private splices: Splice[] = [];
  private mediaWrites = new Map<string, Buffer>();
  private newRels: { id: string; target: string }[] = [];
  private relsXml: string;
  private contentTypesXml: string;
  private nextRelSeq = 0;
  private nextDocPrId = 100000;

  private constructor(
    zip: JSZip,
    xml: string,
    relsXml: string,
    contentTypesXml: string
  ) {
    this.zip = zip;
    this.xml = xml;
    this.relsXml = relsXml;
    this.contentTypesXml = contentTypesXml;
    this.root = indexXml(xml);
  }

  static async load(buffer: Buffer): Promise<DocxEditor> {
    const zip = await JSZip.loadAsync(buffer);
    const docFile = zip.file("word/document.xml");
    if (!docFile) throw new Error("El archivo no es un .docx válido (falta word/document.xml)");
    const relsFile = zip.file("word/_rels/document.xml.rels");
    const ctFile = zip.file("[Content_Types].xml");
    return new DocxEditor(
      zip,
      await docFile.async("string"),
      relsFile ? await relsFile.async("string") : "",
      ctFile ? await ctFile.async("string") : ""
    );
  }

  /** rId -> target ("media/image3.png") for the main document part. */
  relationships(): Record<string, string> {
    const map: Record<string, string> = {};
    const re = /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/?>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.relsXml))) map[m[1]] = m[2];
    return map;
  }

  body(): XmlElement {
    const doc = this.root.children.find((c) => c.name === "w:document");
    const body = doc?.children.find((c) => c.name === "w:body");
    if (!body) throw new Error("El documento no tiene <w:body>");
    return body;
  }

  /** Direct children of <w:body> that carry content, index-aligned with the parser. */
  blocks(): XmlElement[] {
    return this.body().children.filter((c) => c.name === "w:p" || c.name === "w:tbl");
  }

  text(el: XmlElement): string {
    return textOf(this.xml, el);
  }

  /** Raw XML between two offsets — for reading attributes off a tag. */
  rawSlice(start: number, end: number): string {
    return this.xml.slice(start, end);
  }

  /**
   * Replaces a paragraph's visible text, keeping the formatting of its first
   * run. Word splits a visually uniform line across many runs (spell-check
   * and revision marks), so writing into the first run and blanking the rest
   * is what keeps the replaced line looking like the original.
   */
  setParagraphText(p: XmlElement, newText: string): void {
    const ts = findAll(p, "w:t");
    if (ts.length === 0) return;
    this.writeT(ts[0], newText);
    for (let i = 1; i < ts.length; i++) this.writeT(ts[i], "");
  }

  /**
   * Replaces a paragraph whose visible text spans several lines (runs
   * separated by <w:br/>), one entry per line. Extra lines are appended to
   * the last available line slot so nothing is silently dropped.
   */
  setParagraphLines(p: XmlElement, lines: string[]): void {
    const nodes = findAllOf(p, ["w:t", "w:br", "w:cr"]);
    const groups: XmlElement[][] = [];
    let current: XmlElement[] = [];
    let started = false;
    for (const node of nodes) {
      if (node.name === "w:t") {
        current.push(node);
        started = true;
      } else if (started) {
        groups.push(current);
        current = [];
      }
    }
    groups.push(current);

    const usable = groups.filter((g) => g.length > 0);
    if (usable.length === 0) return;

    const values = [...lines];
    if (values.length > usable.length) {
      const overflow = values.splice(usable.length - 1);
      values.push(overflow.filter(Boolean).join(" "));
    }

    usable.forEach((group, i) => {
      this.writeT(group[0], values[i] ?? "");
      for (let j = 1; j < group.length; j++) this.writeT(group[j], "");
    });
  }

  private writeT(t: XmlElement, value: string): void {
    if (t.selfClosing) {
      this.splices.push({
        start: t.start,
        end: t.end,
        text: `<w:t xml:space="preserve">${escapeXml(value)}</w:t>`,
      });
      return;
    }
    // keep the original attributes, but guarantee whitespace survives
    const openTag = this.xml.slice(t.start, t.innerStart);
    const withSpace = openTag.includes("xml:space")
      ? openTag
      : openTag.replace(/^<w:t/, '<w:t xml:space="preserve"');
    this.splices.push({ start: t.start, end: t.innerStart, text: withSpace });
    this.splices.push({ start: t.innerStart, end: t.innerEnd, text: escapeXml(value) });
  }

  /** Removes an element (paragraph, row, drawing…) from the document. */
  remove(el: XmlElement): void {
    this.splices.push({ start: el.start, end: el.end, text: "" });
  }

  removeRange(fromEl: XmlElement, toElInclusive: XmlElement): void {
    this.splices.push({ start: fromEl.start, end: toElInclusive.end, text: "" });
  }

  rows(tbl: XmlElement): XmlElement[] {
    return childrenNamed(tbl, "w:tr");
  }

  cells(tr: XmlElement): XmlElement[] {
    return childrenNamed(tr, "w:tc");
  }

  /** Sets a cell's text, writing into its first paragraph and clearing the others. */
  setCellText(tc: XmlElement, newText: string): void {
    const paras = childrenNamed(tc, "w:p");
    if (paras.length === 0) return;
    this.setParagraphText(paras[0], newText);
    for (let i = 1; i < paras.length; i++) this.setParagraphText(paras[i], "");
  }

  /**
   * Duplicates an existing row (so the copy inherits its borders, shading and
   * fonts) with new cell texts, inserting it after `afterRow`.
   */
  cloneRowAfter(templateRow: XmlElement, afterRow: XmlElement, cellTexts: string[]): void {
    const rowXml = this.xml.slice(templateRow.start, templateRow.end);
    const sub = indexXml(rowXml);
    const tr = sub.children.find((c) => c.name === "w:tr");
    if (!tr) return;

    const subSplices: Splice[] = [];
    const tcs = childrenNamed(tr, "w:tc");
    tcs.forEach((tc, i) => {
      const paras = childrenNamed(tc, "w:p");
      paras.forEach((p, pi) => {
        const value = pi === 0 ? cellTexts[i] ?? "" : "";
        const ts = findAll(p, "w:t");
        ts.forEach((t, ti) => {
          const v = ti === 0 ? value : "";
          if (t.selfClosing) {
            subSplices.push({
              start: t.start,
              end: t.end,
              text: `<w:t xml:space="preserve">${escapeXml(v)}</w:t>`,
            });
          } else {
            const openTag = rowXml.slice(t.start, t.innerStart);
            const withSpace = openTag.includes("xml:space")
              ? openTag
              : openTag.replace(/^<w:t/, '<w:t xml:space="preserve"');
            subSplices.push({ start: t.start, end: t.innerStart, text: withSpace });
            subSplices.push({ start: t.innerStart, end: t.innerEnd, text: escapeXml(v) });
          }
        });
      });
    });

    const newRow = applySplices(rowXml, subSplices);
    this.splices.push({ start: afterRow.end, end: afterRow.end, text: newRow });
  }

  /** Replaces the bytes of an existing media part, keeping its name and every reference to it. */
  replaceMedia(target: string, data: Buffer): void {
    this.mediaWrites.set(`word/${target.replace(/^\/+/, "")}`, data);
  }

  /** Adds a new image part and returns the relationship id that points at it. */
  addMedia(data: Buffer, extension: string): string {
    const seq = ++this.nextRelSeq;
    const name = `media/cw_${Date.now()}_${seq}.${extension}`;
    this.mediaWrites.set(`word/${name}`, data);
    const id = `rIdCW${seq}`;
    this.newRels.push({ id, target: name });
    this.ensureContentType(extension);
    return id;
  }

  private ensureContentType(extension: string): void {
    const ext = extension.toLowerCase();
    if (new RegExp(`Extension="${ext}"`, "i").test(this.contentTypesXml)) return;
    const mime =
      ext === "png"
        ? "image/png"
        : ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "gif"
        ? "image/gif"
        : "application/octet-stream";
    this.contentTypesXml = this.contentTypesXml.replace(
      /<Types\b[^>]*>/,
      (m) => `${m}<Default Extension="${ext}" ContentType="${mime}"/>`
    );
  }

  /** Points an existing <w:drawing> (or its <a:blip>) at a different image relationship. */
  setDrawingImage(drawing: XmlElement, relId: string): void {
    for (const blip of findAll(drawing, "a:blip")) {
      const tagXml = this.xml.slice(blip.start, blip.innerStart === blip.end ? blip.end : blip.innerStart);
      const replaced = tagXml.replace(/r:embed="[^"]*"/, `r:embed="${relId}"`);
      this.splices.push({
        start: blip.start,
        end: blip.innerStart === blip.end ? blip.end : blip.innerStart,
        text: replaced,
      });
    }
  }

  /**
   * Duplicates a drawing inside the same paragraph, pointing the copy at
   * `relId`. When `aspect` (width/height of the new image) is given, the
   * clone's declared size is refit to that aspect ratio, contained within
   * the original drawing's box, instead of inheriting its exact box —
   * otherwise a photo added past the template's own slots would come out
   * stretched to fit a frame sized for a differently-shaped picture.
   */
  cloneDrawingAfter(drawing: XmlElement, relId: string, aspect?: number): void {
    let clone = this.xml.slice(drawing.start, drawing.end);
    clone = clone.replace(/r:embed="[^"]*"/g, `r:embed="${relId}"`);
    clone = clone.replace(/(<wp:docPr\b[^>]*\bid=")\d+(")/g, `$1${++this.nextDocPrId}$2`);
    clone = clone.replace(/(<pic:cNvPr\b[^>]*\bid=")\d+(")/g, `$1${++this.nextDocPrId}$2`);
    if (aspect && Number.isFinite(aspect)) {
      clone = clone.replace(
        /(<(?:wp:extent|a:ext)\b[^>]*\bcx=")(\d+)("[^>]*\bcy=")(\d+)("[^>]*\/?>)/g,
        (full: string, pre: string, cxStr: string, mid: string, cyStr: string, post: string) => {
          const fit = fitExtent(parseInt(cxStr, 10), parseInt(cyStr, 10), aspect);
          if (!fit) return full;
          return `${pre}${fit.cx}${mid}${fit.cy}${post}`;
        }
      );
    }
    this.splices.push({ start: drawing.end, end: drawing.end, text: clone });
  }

  /**
   * Resizes a drawing's declared extent (both the outer `wp:extent` and the
   * inner picture `a:xfrm`/`a:ext`) so an image of `aspect` (width/height)
   * displays without distortion, contained within the box the drawing
   * already occupies — used after replaceMedia() swaps in a photo whose
   * proportions differ from the one it replaces, since replaceMedia() only
   * changes the bytes and leaves the old box in place.
   */
  resizeDrawingToAspect(drawing: XmlElement, aspect: number | null | undefined): void {
    if (!aspect || !Number.isFinite(aspect)) return;
    for (const ext of findAllOf(drawing, ["wp:extent", "a:ext"])) {
      const tagEnd = ext.selfClosing ? ext.end : ext.innerStart;
      const tagXml = this.xml.slice(ext.start, tagEnd);
      const cxMatch = tagXml.match(/cx="(\d+)"/);
      const cyMatch = tagXml.match(/cy="(\d+)"/);
      if (!cxMatch || !cyMatch) continue;
      const fit = fitExtent(parseInt(cxMatch[1], 10), parseInt(cyMatch[1], 10), aspect);
      if (!fit) continue;
      const newTag = tagXml
        .replace(/cx="\d+"/, `cx="${fit.cx}"`)
        .replace(/cy="\d+"/, `cy="${fit.cy}"`);
      this.splices.push({ start: ext.start, end: tagEnd, text: newTag });
    }
  }

  drawingsIn(el: XmlElement): XmlElement[] {
    return findAll(el, "w:drawing");
  }

  /**
   * Applies every [oldText, newText] pair across the letter's top-level
   * paragraphs (intro, section descriptions, terms, considerations,
   * closing) — the running text that isn't driven by a specific field.
   * Table cells and anchored fields (title, date, recipient, signature…)
   * get their own targeted writes instead of this sweep, both because they
   * need the exact new value rather than a substring swap and because
   * writing the same run twice would collide; pass their paragraphs in
   * `skip` so this pass leaves them alone.
   *
   * All pairs are resolved against a paragraph's text before anything is
   * written, and each paragraph is written at most once. Running each pair
   * as its own full sweep (the previous shape of this method) reread the
   * same untouched `this.xml` for every pair, so a paragraph matching two
   * pairs — e.g. the client's name being a substring of the institution's,
   * "Melipilla" inside "Municipalidad de Melipilla" — got a second splice
   * over runs the first pair had already rewritten, and `applySplices`
   * throws on that overlap. Returns how many paragraphs changed.
   */
  replaceTextEverywhere(pairs: [string, string][], skip?: Set<XmlElement>): number {
    const active = pairs.filter(([oldText, newText]) => oldText && oldText !== newText);
    if (active.length === 0) return 0;
    let count = 0;
    for (const block of this.blocks()) {
      if (block.name !== "w:p" || skip?.has(block)) continue;
      let text = this.text(block);
      let changed = false;
      for (const [oldText, newText] of active) {
        if (!text.includes(oldText)) continue;
        text = text.split(oldText).join(newText);
        changed = true;
      }
      if (!changed) continue;
      this.setParagraphLines(block, text.split("\n"));
      count++;
    }
    return count;
  }

  async save(): Promise<Buffer> {
    const finalXml = applySplices(this.xml, this.splices);
    this.zip.file("word/document.xml", finalXml);

    if (this.newRels.length > 0) {
      const additions = this.newRels
        .map(
          (r) =>
            `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${r.target}"/>`
        )
        .join("");
      this.relsXml = this.relsXml.replace("</Relationships>", `${additions}</Relationships>`);
    }
    if (this.relsXml) this.zip.file("word/_rels/document.xml.rels", this.relsXml);
    if (this.contentTypesXml) this.zip.file("[Content_Types].xml", this.contentTypesXml);

    for (const [path, data] of this.mediaWrites) {
      this.zip.file(path, data);
    }

    return this.zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  }
}
