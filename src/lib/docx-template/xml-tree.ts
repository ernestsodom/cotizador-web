/**
 * Minimal, faithful XML element indexer for OOXML surgery.
 *
 * We deliberately do NOT parse-and-reserialize documents: any round trip
 * through a generic XML library risks changing namespaces, attribute
 * order, self-closing forms or entity escaping, and the whole point of the
 * template renderer is that untouched parts of the document come out
 * byte-identical. Instead we index element ranges over the raw string and
 * apply targeted splices.
 */

export interface XmlElement {
  name: string;
  /** offset of "<" of the opening tag */
  start: number;
  /** offset just past ">" of the closing tag (or of the self-closing tag) */
  end: number;
  /** offset just past ">" of the opening tag; equals `end` for self-closing */
  innerStart: number;
  /** offset of "<" of the closing tag; equals `innerStart` for self-closing */
  innerEnd: number;
  selfClosing: boolean;
  children: XmlElement[];
  parent: XmlElement | null;
}

interface RawTag {
  name: string;
  start: number;
  end: number;
  kind: "open" | "close" | "self";
}

/** Finds the ">" that closes the tag starting at `lt`, skipping quoted attribute values. */
function findTagEnd(xml: string, lt: number): number {
  let quote: string | null = null;
  for (let i = lt + 1; i < xml.length; i++) {
    const c = xml[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      return i;
    }
  }
  return -1;
}

function* scanTags(xml: string): Generator<RawTag> {
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    if (lt === -1) return;

    if (xml.startsWith("<!--", lt)) {
      const close = xml.indexOf("-->", lt);
      i = close === -1 ? xml.length : close + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", lt)) {
      const close = xml.indexOf("]]>", lt);
      i = close === -1 ? xml.length : close + 3;
      continue;
    }
    if (xml.startsWith("<?", lt) || xml.startsWith("<!", lt)) {
      const close = findTagEnd(xml, lt);
      i = close === -1 ? xml.length : close + 1;
      continue;
    }

    const gt = findTagEnd(xml, lt);
    if (gt === -1) return;

    const isClose = xml[lt + 1] === "/";
    const isSelf = xml[gt - 1] === "/";
    const nameStart = lt + (isClose ? 2 : 1);
    let nameEnd = nameStart;
    while (nameEnd < gt && !/[\s/>]/.test(xml[nameEnd])) nameEnd++;
    const name = xml.slice(nameStart, nameEnd);

    yield {
      name,
      start: lt,
      end: gt + 1,
      kind: isClose ? "close" : isSelf ? "self" : "open",
    };
    i = gt + 1;
  }
}

/** Builds the element tree for an XML document, preserving source offsets. */
export function indexXml(xml: string): XmlElement {
  const root: XmlElement = {
    name: "#document",
    start: 0,
    end: xml.length,
    innerStart: 0,
    innerEnd: xml.length,
    selfClosing: false,
    children: [],
    parent: null,
  };

  const stack: XmlElement[] = [root];

  for (const tag of scanTags(xml)) {
    const top = stack[stack.length - 1];
    if (tag.kind === "self") {
      top.children.push({
        name: tag.name,
        start: tag.start,
        end: tag.end,
        innerStart: tag.end,
        innerEnd: tag.end,
        selfClosing: true,
        children: [],
        parent: top,
      });
    } else if (tag.kind === "open") {
      const el: XmlElement = {
        name: tag.name,
        start: tag.start,
        end: -1,
        innerStart: tag.end,
        innerEnd: -1,
        selfClosing: false,
        children: [],
        parent: top,
      };
      top.children.push(el);
      stack.push(el);
    } else {
      // closing tag: unwind to the matching open element
      for (let d = stack.length - 1; d > 0; d--) {
        if (stack[d].name === tag.name) {
          const el = stack[d];
          el.innerEnd = tag.start;
          el.end = tag.end;
          stack.length = d;
          break;
        }
      }
    }
  }

  return root;
}

export function findAll(el: XmlElement, name: string, out: XmlElement[] = []): XmlElement[] {
  for (const child of el.children) {
    if (child.name === name) out.push(child);
    findAll(child, name, out);
  }
  return out;
}

export function childrenNamed(el: XmlElement, name: string): XmlElement[] {
  return el.children.filter((c) => c.name === name);
}

/** Descendants of `el` named any of `names`, in document order. */
export function findAllOf(el: XmlElement, names: string[], out: XmlElement[] = []): XmlElement[] {
  for (const child of el.children) {
    if (names.includes(child.name)) out.push(child);
    findAllOf(child, names, out);
  }
  return out;
}

/** Visible text of an element; line breaks and tabs render as \n and \t. */
export function textOf(xml: string, el: XmlElement): string {
  let out = "";
  for (const node of findAllOf(el, ["w:t", "w:br", "w:cr", "w:tab"])) {
    if (node.name === "w:t") {
      out += unescapeXml(xml.slice(node.innerStart, node.innerEnd));
    } else if (node.name === "w:tab") {
      out += "\t";
    } else {
      out += "\n";
    }
  }
  return out;
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** A pending replacement of [start, end) with `text`. */
export interface Splice {
  start: number;
  end: number;
  text: string;
}

/** Applies splices right-to-left so earlier offsets stay valid. */
export function applySplices(xml: string, splices: Splice[]): string {
  const sorted = [...splices].sort((a, b) => b.start - a.start);
  let out = xml;
  let lastStart = Infinity;
  for (const s of sorted) {
    if (s.end > lastStart) {
      throw new Error("Overlapping splices in XML edit");
    }
    out = out.slice(0, s.start) + s.text + out.slice(s.end);
    lastStart = s.start;
  }
  return out;
}
