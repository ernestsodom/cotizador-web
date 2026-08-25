import type { ParsedAnchors } from "@/lib/document-parsers/types";

export interface RenderImage {
  data: Buffer;
  contentType: string;
  /**
   * When this photo is one the source document already contained, the media
   * part it came from. Replica rendering uses it to leave untouched photos
   * byte-identical instead of re-encoding them.
   */
  sourceMediaTarget?: string;
}

export interface RenderItem {
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  currency: string;
  photos: RenderImage[];
  /** Template anchors — used only by template-based (replica) renderers. */
  tableRowIndex?: number | null;
  sectionStartBlock?: number | null;
  sectionEndBlock?: number | null;
  /** Photo slots this item occupies in the template, in document order. */
  templatePhotoTargets?: string[];
}

export interface RenderQuoteInput {
  title?: string | null;
  subtitle?: string | null;
  letterCity?: string | null;
  letterDateIso: string;
  letterNumber?: string | null;
  recipientName?: string | null;
  recipientPosition?: string | null;
  recipientInstitution?: string | null;
  clientName?: string | null;
  introText?: string | null;
  termsText?: string[];
  considerationsText?: string[];
  closingText?: string | null;
  currency: string;
  items: RenderItem[];
  logo?: RenderImage | null;
  coverImage?: RenderImage | null;
  signatoryName?: string | null;
  signatoryPosition?: string | null;
  signatureImage?: RenderImage | null;

  /** Template-based rendering only. */
  templateDocx?: Buffer | null;
  anchors?: ParsedAnchors | null;
  /** Items the user unchecked — their table rows and sections come out. */
  excludedItems?: RenderItem[];
  removeExcludedSections?: boolean;
}

export interface QuoteRenderer {
  key: string;
  name: string;
  /** Replica renderers need the original .docx to edit. */
  requiresTemplate: boolean;
  generateDocx(input: RenderQuoteInput): Promise<Buffer>;
}
