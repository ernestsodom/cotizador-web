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
