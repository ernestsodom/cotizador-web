export interface ParsedImage {
  /** Stable key within this parse run (used to link items -> images before anything is persisted). */
  key: string;
  data: Buffer;
  contentType: string;
  /** true for images found before the recipient block — likely letterhead/logos. */
  isHeaderCandidate: boolean;
  /** nearby section heading, if any (e.g. "1.1 Administración..."). */
  sectionLabel?: string;
}

export interface ParsedItem {
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  /** keys into ParsedDocument.images, best-guess photos for this item. */
  suggestedImageKeys: string[];
}

export interface ParsedDocumentMeta {
  letterCity?: string;
  letterDateIso?: string;
  letterNumber?: string;
  recipientName?: string;
  recipientPosition?: string;
  recipientInstitution?: string;
  clientNameGuess?: string;
  introText?: string;
  termsText?: string[];
  considerationsText?: string[];
  closingText?: string;
  signatoryName?: string;
  signatoryPosition?: string;
  signatoryCompany?: string;
}

export interface ParsedDocument {
  meta: ParsedDocumentMeta;
  items: ParsedItem[];
  images: ParsedImage[];
}

export type DocumentParser = (fileBuffer: Buffer) => Promise<ParsedDocument>;
