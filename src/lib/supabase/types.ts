// Hand-written row types matching supabase/schema.sql.
// (Kept minimal on purpose — swap for `supabase gen types` output once the
// schema stabilizes.)

export type DocumentStatus = "uploaded" | "parsing" | "parsed" | "error";
export type QuoteStatus = "draft" | "approved" | "generated";
export type SourceImageKind = "logo_candidate" | "photo";

export interface DocumentType {
  id: string;
  key: string;
  name: string;
  created_at: string;
}

export interface QuoteFormat {
  id: string;
  key: string;
  name: string;
  created_at: string;
}

export interface SourceDocument {
  id: string;
  document_type_id: string;
  original_filename: string;
  storage_path: string;
  status: DocumentStatus;
  error_message: string | null;
  parsed_meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SourceDocumentImage {
  id: string;
  source_document_id: string;
  storage_path: string;
  kind: SourceImageKind;
  section_label: string | null;
  order_index: number;
  created_at: string;
}

export interface SourceDocumentItem {
  id: string;
  source_document_id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  currency: string;
  order_index: number;
  created_at: string;
}

export interface SourceDocumentItemImage {
  id: string;
  source_document_item_id: string;
  source_document_image_id: string;
  order_index: number;
}

export interface Logo {
  id: string;
  name: string;
  storage_path: string;
  created_at: string;
}

export interface Signatory {
  id: string;
  name: string;
  position: string;
  signature_storage_path: string | null;
  created_at: string;
}

export interface Quote {
  id: string;
  source_document_id: string | null;
  quote_format_id: string;
  status: QuoteStatus;
  title: string | null;
  client_name: string | null;
  recipient_name: string | null;
  recipient_position: string | null;
  recipient_institution: string | null;
  letter_number: string | null;
  letter_date: string;
  logo_id: string | null;
  signatory_id: string | null;
  currency: string;
  notes: string | null;
  generated_storage_path: string | null;
  approved_at: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  source_document_item_id: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  currency: string;
  included: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface QuoteItemPhoto {
  id: string;
  quote_item_id: string;
  storage_path: string;
  order_index: number;
  created_at: string;
}
