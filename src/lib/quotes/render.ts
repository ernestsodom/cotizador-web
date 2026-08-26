import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { BUCKETS, downloadFile } from "@/lib/supabase/storage";
import { getQuoteRenderer } from "@/lib/quote-renderers/registry";
import type { RenderImage, RenderItem } from "@/lib/quote-renderers/types";
import type { ParsedDocumentMeta } from "@/lib/document-parsers/types";

export const DEFAULT_FORMAT_KEY = "reutility_replica_v1";

interface PhotoRow {
  storage_path: string;
  bucket: string | null;
  source_media_target: string | null;
}

/** Loads every image a render needs in parallel — serial downloads used to
 *  push generation past the serverless time limit. */
async function loadPhotos(rows: PhotoRow[]): Promise<RenderImage[]> {
  return Promise.all(
    rows.map(async (p) => {
      const bucket = p.bucket || BUCKETS.quotePhotos;
      const data = await downloadFile(bucket, p.storage_path);
      const ext = p.storage_path.split(".").pop()?.toLowerCase() ?? "png";
      return {
        data,
        contentType: ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`,
        sourceMediaTarget: p.source_media_target ?? undefined,
      };
    })
  );
}

async function loadOne(
  bucket: string,
  path: string | null | undefined
): Promise<RenderImage | null> {
  if (!path) return null;
  const data = await downloadFile(bucket, path);
  const ext = path.split(".").pop()?.toLowerCase() ?? "png";
  return { data, contentType: ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}` };
}

/**
 * [oldText, newText] pairs for fields the user can rename after the fact —
 * the client, its institution name, the person it's addressed to — as the
 * source document originally had them vs. what the quote now says. Used to
 * carry a rename through every place that text appears, not just its own
 * field: change "Municipalidad de Melipilla" to "Proexsi" once, and it
 * updates the intro paragraph, the considerations, any section that
 * mentions it too.
 */
function textReplacementPairs(
  sourceMeta: ParsedDocumentMeta,
  quote: Record<string, unknown>
): [string, string][] {
  const pairs: [string, string][] = [];
  const add = (oldText: string | undefined, newText: unknown) => {
    if (oldText && typeof newText === "string" && newText && newText !== oldText) {
      pairs.push([oldText, newText]);
    }
  };
  add(sourceMeta.recipientInstitution, quote.recipient_institution);
  add(sourceMeta.clientNameGuess, quote.client_name);
  add(sourceMeta.recipientName, quote.recipient_name);
  return pairs;
}

function applyPairs(text: string, pairs: [string, string][]): string {
  let out = text;
  for (const [oldText, newText] of pairs) out = out.split(oldText).join(newText);
  return out;
}

function applyPairsOrNull(
  text: string | null | undefined,
  pairs: [string, string][]
): string | null {
  return text == null ? null : applyPairs(text, pairs);
}

/**
 * Produces the quote document exactly as it will be delivered. The draft
 * preview and the final generation both go through here, so what the user
 * approves is byte-for-byte what they download.
 */
export async function renderQuoteDocx(quoteId: string): Promise<Buffer> {
  const sb = supabaseServer();

  const { data: quote } = await sb
    .from("quotes")
    .select("*, quote_formats(key)")
    .eq("id", quoteId)
    .single();
  if (!quote) throw new Error("Cotización no encontrada.");

  const formatKey =
    (quote.quote_formats as unknown as { key: string } | null)?.key ?? DEFAULT_FORMAT_KEY;
  const renderer = getQuoteRenderer(formatKey);

  const { data: allItems } = await sb
    .from("quote_items")
    .select("*, source_document_items(table_row_index, section_start_block, section_end_block)")
    .eq("quote_id", quoteId)
    .order("order_index");

  const itemIds = (allItems ?? []).map((i) => i.id as string);
  const { data: photoRows } = itemIds.length
    ? await sb
        .from("quote_item_photos")
        .select("quote_item_id, storage_path, bucket, source_media_target, order_index")
        .in("quote_item_id", itemIds)
        .order("order_index")
    : { data: [] as unknown[] };

  const photosByItem = new Map<string, PhotoRow[]>();
  for (const raw of (photoRows ?? []) as Record<string, unknown>[]) {
    const key = raw.quote_item_id as string;
    const list = photosByItem.get(key) ?? [];
    list.push({
      storage_path: raw.storage_path as string,
      bucket: (raw.bucket as string | null) ?? null,
      source_media_target: (raw.source_media_target as string | null) ?? null,
    });
    photosByItem.set(key, list);
  }

  const anchorsOf = (row: Record<string, unknown>) => {
    const src = row.source_document_items as
      | {
          table_row_index: number | null;
          section_start_block: number | null;
          section_end_block: number | null;
        }
      | null;
    return {
      tableRowIndex: src?.table_row_index ?? null,
      sectionStartBlock: src?.section_start_block ?? null,
      sectionEndBlock: src?.section_end_block ?? null,
    };
  };

  let sourceMeta: ParsedDocumentMeta = {};
  let templateDocx: Buffer | null = null;
  if (quote.source_document_id) {
    const { data: sourceDoc } = await sb
      .from("source_documents")
      .select("parsed_meta, storage_path")
      .eq("id", quote.source_document_id)
      .single();
    sourceMeta = (sourceDoc?.parsed_meta ?? {}) as ParsedDocumentMeta;
    if (renderer.requiresTemplate && sourceDoc?.storage_path) {
      templateDocx = await downloadFile(
        BUCKETS.sourceDocuments,
        sourceDoc.storage_path as string
      );
    }
  }

  if (renderer.requiresTemplate && !templateDocx) {
    throw new Error(
      "Este formato necesita el documento original y ya no está disponible. Elige el formato moderno o vuelve a cargar el documento."
    );
  }
  if (renderer.requiresTemplate && !sourceMeta.anchors) {
    throw new Error(
      "Este documento se analizó con una versión anterior del sistema y no tiene las marcas que el formato original necesita. Vuelve a cargar el documento para usar este formato, o elige el formato moderno."
    );
  }

  const pairs = textReplacementPairs(sourceMeta, quote as Record<string, unknown>);

  const buildItem = async (row: Record<string, unknown>): Promise<RenderItem> => {
    const rows = photosByItem.get(row.id as string) ?? [];
    return {
      name: applyPairs(row.name as string, pairs),
      description: applyPairsOrNull(row.description as string | null, pairs),
      quantity: Number(row.quantity),
      unitPrice: Number(row.unit_price),
      currency: row.currency as string,
      photos: await loadPhotos(rows),
      ...anchorsOf(row),
      templatePhotoTargets: rows
        .map((p) => p.source_media_target)
        .filter((t): t is string => !!t),
    };
  };

  const rowsArr = (allItems ?? []) as Record<string, unknown>[];
  const includedRows = rowsArr.filter((i) => i.included);
  const excludedRows = rowsArr.filter((i) => !i.included);

  const items = await Promise.all(includedRows.map(buildItem));
  const excludedItems: RenderItem[] = excludedRows.map((row) => ({
    name: applyPairs(row.name as string, pairs),
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    currency: row.currency as string,
    photos: [],
    ...anchorsOf(row),
  }));

  const [logoRow, signatoryRow] = await Promise.all([
    quote.logo_id
      ? sb.from("logos").select("storage_path").eq("id", quote.logo_id).single()
      : Promise.resolve({ data: null }),
    quote.signatory_id
      ? sb
          .from("signatories")
          .select("name, position, signature_storage_path")
          .eq("id", quote.signatory_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const sig = signatoryRow.data as
    | { name: string; position: string; signature_storage_path: string | null }
    | null;

  const [logo, coverImage, signatureImage] = await Promise.all([
    loadOne(BUCKETS.logos, (logoRow.data as { storage_path: string } | null)?.storage_path),
    loadOne(BUCKETS.quotePhotos, quote.cover_image_path as string | null),
    loadOne(BUCKETS.signatures, sig?.signature_storage_path),
  ]);

  return renderer.generateDocx({
    title: applyPairsOrNull(quote.title as string | null, pairs),
    subtitle: applyPairsOrNull((quote.subtitle as string | null) ?? sourceMeta.subtitle ?? null, pairs),
    letterCity: sourceMeta.letterCity,
    letterDateIso: quote.letter_date as string,
    letterNumber: applyPairsOrNull(quote.letter_number as string | null, pairs),
    recipientName: quote.recipient_name as string | null,
    recipientPosition: applyPairsOrNull(quote.recipient_position as string | null, pairs),
    recipientInstitution: quote.recipient_institution as string | null,
    clientName: quote.client_name as string | null,
    introText: applyPairsOrNull(sourceMeta.introText, pairs),
    termsText: sourceMeta.termsText?.map((t) => applyPairs(t, pairs)),
    considerationsText: sourceMeta.considerationsText?.map((t) => applyPairs(t, pairs)),
    closingText: applyPairsOrNull(sourceMeta.closingText, pairs),
    currency: quote.currency as string,
    items,
    excludedItems,
    removeExcludedSections: quote.remove_excluded_sections !== false,
    logo,
    coverImage,
    signatoryName: sig?.name ?? null,
    signatoryPosition: sig?.position ?? null,
    signatureImage,
    templateDocx,
    anchors: sourceMeta.anchors ?? null,
    textReplacements: pairs,
  });
}

export function quoteFileName(title: string | null, client: string | null): string {
  const parts = [title || "Cotizacion", client].filter(Boolean).join(" - ");
  return `${parts.replace(/[^\w\s.-]/g, "").trim() || "Cotizacion"}.docx`;
}
