export interface RenderImage {
  data: Buffer;
  contentType: string;
}

export interface RenderItem {
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  currency: string;
  photos: RenderImage[];
}

export interface RenderQuoteInput {
  title?: string | null;
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
  signatoryName?: string | null;
  signatoryPosition?: string | null;
  signatureImage?: RenderImage | null;
}

export interface QuoteRenderer {
  key: string;
  name: string;
  generateDocx(input: RenderQuoteInput): Promise<Buffer>;
}
