export interface ParsedImage {
  /** Stable key within this parse run (links items to images before anything is persisted). */
  key: string;
  data: Buffer;
  contentType: string;
  /** true for images found before the recipient block — letterhead/cover art. */
  isHeaderCandidate: boolean;
  /** nearby section heading, if any (e.g. "1.1 Administración..."). */
  sectionLabel?: string;
  /** Template anchor: the media part this image came from ("media/image3.png"). */
  mediaTarget: string;
  /** Template anchor: index of the body block (paragraph) that holds it. */
  blockIndex: number;
}

export interface ParsedItem {
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  /** keys into ParsedDocument.images, best-guess photos for this item. */
  suggestedImageKeys: string[];
  /** Template anchor: row index inside the pricing table. */
  tableRowIndex: number;
  /** Template anchors: body-block range of this item's descriptive section. */
  sectionStartBlock?: number;
  sectionEndBlock?: number;
}

/**
 * Body-block indices the replica renderer edits. They are indices into the
 * direct children of <w:body> that are paragraphs or tables, which is the
 * same list DocxEditor.blocks() returns — parser and renderer read the
 * document through the same indexer so the anchors always line up.
 */
export interface ParsedAnchors {
  coverLogoBlock?: number;
  coverImageBlock?: number;
  titleBlock?: number;
  subtitleBlock?: number;
  dateBlock?: number;
  letterNumberBlock?: number;
  recipientNameBlock?: number;
  recipientInstitutionBlock?: number;
  tableBlock?: number;
  signatureNameBlock?: number;
  signaturePositionBlock?: number;
}

export interface ParsedDocumentMeta {
  letterCity?: string;
  letterDateIso?: string;
  letterNumber?: string;
  recipientName?: string;
  recipientPosition?: string;
  recipientInstitution?: string;
  clientNameGuess?: string;
  title?: string;
  subtitle?: string;
  introText?: string;
  termsText?: string[];
  considerationsText?: string[];
  closingText?: string;
  signatoryName?: string;
  signatoryPosition?: string;
  signatoryCompany?: string;
  anchors?: ParsedAnchors;
}

export interface ParsedDocument {
  meta: ParsedDocumentMeta;
  items: ParsedItem[];
  images: ParsedImage[];
}

export type DocumentParser = (fileBuffer: Buffer) => Promise<ParsedDocument>;

/**
 * Human-readable labels for the editable fields whose anchors are missing
 * from a parsed document — e.g. because its salutation isn't "Señor(a)" or
 * its title doesn't sit right before the date line, so the parser never
 * found that spot in the body. In replica format, a field whose anchor is
 * missing keeps whatever the original document said no matter what the
 * user types for it, which otherwise just looks like edits aren't saving.
 */
export function missingReplicaAnchorLabels(anchors: ParsedAnchors | undefined): string[] {
  const a = anchors ?? {};
  const labels: string[] = [];
  if (a.titleBlock == null && a.subtitleBlock == null) labels.push("Título / bajada de la portada");
  if (a.recipientNameBlock == null) labels.push("Destinatario (nombre y cargo)");
  if (a.recipientInstitutionBlock == null) labels.push("Institución destinataria");
  if (a.letterNumberBlock == null) labels.push("N° de carta");
  if (a.dateBlock == null) labels.push("Fecha de la carta");
  if (a.signatureNameBlock == null && a.signaturePositionBlock == null) labels.push("Firma");
  return labels;
}
