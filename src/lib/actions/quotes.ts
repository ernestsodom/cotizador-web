"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { BUCKETS, uploadFile } from "@/lib/supabase/storage";
import { renderQuoteDocx, DEFAULT_FORMAT_KEY } from "@/lib/quotes/render";
import type { ParsedDocumentMeta } from "@/lib/document-parsers/types";

function revalidateQuote(quoteId: string) {
  revalidatePath(`/quotes/${quoteId}`, "layout");
}

export async function createQuoteFromDocument(
  sourceDocumentId: string,
  formatKey: string = DEFAULT_FORMAT_KEY
): Promise<never> {
  const sb = supabaseServer();

  const { data: format } = await sb
    .from("quote_formats")
    .select("id")
    .eq("key", formatKey)
    .single();
  if (!format) throw new Error("El formato de cotización no está configurado.");

  const { data: sourceDoc } = await sb
    .from("source_documents")
    .select("id, parsed_meta, project_id")
    .eq("id", sourceDocumentId)
    .single();
  if (!sourceDoc) throw new Error("Documento no encontrado.");

  const meta = (sourceDoc.parsed_meta ?? {}) as ParsedDocumentMeta;

  const { data: quote, error: quoteErr } = await sb
    .from("quotes")
    .insert({
      source_document_id: sourceDocumentId,
      project_id: sourceDoc.project_id,
      quote_format_id: format.id,
      status: "draft",
      title: meta.title ?? "Propuesta comercial",
      subtitle: meta.subtitle ?? null,
      client_name: meta.clientNameGuess ?? null,
      recipient_name: meta.recipientName ?? null,
      recipient_position: meta.recipientPosition ?? null,
      recipient_institution: meta.recipientInstitution ?? null,
      letter_number: meta.letterNumber ?? null,
      letter_date: meta.letterDateIso ?? new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (quoteErr || !quote) throw new Error("No se pudo crear la cotización.");

  const { data: sourceItems } = await sb
    .from("source_document_items")
    .select("id, name, description, quantity, unit_price, currency, order_index")
    .eq("source_document_id", sourceDocumentId)
    .order("order_index");

  const currency = sourceItems?.[0]?.currency ?? "CLP";
  await sb.from("quotes").update({ currency }).eq("id", quote.id);

  for (const item of sourceItems ?? []) {
    const { data: quoteItem } = await sb
      .from("quote_items")
      .insert({
        quote_id: quote.id,
        source_document_item_id: item.id,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        currency: item.currency,
        included: true,
        order_index: item.order_index,
      })
      .select("id")
      .single();
    if (!quoteItem) continue;

    // photos default to the ones the document already carried for this item
    const { data: candidates } = await sb
      .from("source_document_item_images")
      .select("order_index, source_document_images(storage_path, media_target)")
      .eq("source_document_item_id", item.id)
      .order("order_index");

    let photoOrder = 0;
    for (const c of candidates ?? []) {
      const img = c.source_document_images as unknown as
        | { storage_path: string; media_target: string | null }
        | null;
      if (!img) continue;
      await sb.from("quote_item_photos").insert({
        quote_item_id: quoteItem.id,
        storage_path: img.storage_path,
        bucket: BUCKETS.documentImages,
        source_media_target: img.media_target,
        order_index: photoOrder++,
      });
    }
  }

  redirect(`/quotes/${quote.id}/items`);
}

export async function setQuoteFormat(quoteId: string, formatKey: string): Promise<void> {
  const sb = supabaseServer();
  const { data: format } = await sb
    .from("quote_formats")
    .select("id")
    .eq("key", formatKey)
    .single();
  if (!format) throw new Error("Formato desconocido.");
  await sb.from("quotes").update({ quote_format_id: format.id }).eq("id", quoteId);
  revalidateQuote(quoteId);
}

export async function updateQuoteItem(
  quoteItemId: string,
  patch: Partial<{
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    included: boolean;
  }>
): Promise<void> {
  const sb = supabaseServer();
  const { data: item } = await sb
    .from("quote_items")
    .select("quote_id")
    .eq("id", quoteItemId)
    .single();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.quantity !== undefined) row.quantity = patch.quantity;
  if (patch.unitPrice !== undefined) row.unit_price = patch.unitPrice;
  if (patch.included !== undefined) row.included = patch.included;
  await sb.from("quote_items").update(row).eq("id", quoteItemId);
  if (item) revalidateQuote(item.quote_id as string);
}

export async function addQuoteItem(
  quoteId: string,
  input: { name: string; description?: string; quantity: number; unitPrice: number }
): Promise<void> {
  const sb = supabaseServer();
  const { data: quote } = await sb.from("quotes").select("currency").eq("id", quoteId).single();
  const { data: maxRow } = await sb
    .from("quote_items")
    .select("order_index")
    .eq("quote_id", quoteId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  await sb.from("quote_items").insert({
    quote_id: quoteId,
    name: input.name,
    description: input.description ?? null,
    quantity: input.quantity,
    unit_price: input.unitPrice,
    currency: quote?.currency ?? "CLP",
    included: true,
    order_index: ((maxRow?.order_index as number | undefined) ?? -1) + 1,
  });
  revalidateQuote(quoteId);
}

export async function removeQuoteItem(quoteItemId: string): Promise<void> {
  const sb = supabaseServer();
  const { data: item } = await sb
    .from("quote_items")
    .select("quote_id")
    .eq("id", quoteItemId)
    .single();
  await sb.from("quote_items").delete().eq("id", quoteItemId);
  if (item) revalidateQuote(item.quote_id as string);
}

export async function addQuoteItemPhotoFromLibrary(
  quoteItemId: string,
  storagePath: string,
  sourceMediaTarget: string | null
): Promise<void> {
  const sb = supabaseServer();
  const { data: maxRow } = await sb
    .from("quote_item_photos")
    .select("order_index")
    .eq("quote_item_id", quoteItemId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  await sb.from("quote_item_photos").insert({
    quote_item_id: quoteItemId,
    storage_path: storagePath,
    bucket: BUCKETS.documentImages,
    source_media_target: sourceMediaTarget,
    order_index: ((maxRow?.order_index as number | undefined) ?? -1) + 1,
  });
  const { data: item } = await sb
    .from("quote_items")
    .select("quote_id")
    .eq("id", quoteItemId)
    .single();
  if (item) revalidateQuote(item.quote_id as string);
}

export async function uploadQuoteItemPhoto(
  quoteItemId: string,
  formData: FormData
): Promise<void> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Selecciona una imagen para subir.");
  }
  const sb = supabaseServer();
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${quoteItemId}/${randomUUID()}.${ext}`;
  await uploadFile(BUCKETS.quotePhotos, path, buffer, file.type || "image/jpeg");

  const { data: maxRow } = await sb
    .from("quote_item_photos")
    .select("order_index")
    .eq("quote_item_id", quoteItemId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  await sb.from("quote_item_photos").insert({
    quote_item_id: quoteItemId,
    storage_path: path,
    bucket: BUCKETS.quotePhotos,
    source_media_target: null,
    order_index: ((maxRow?.order_index as number | undefined) ?? -1) + 1,
  });

  const { data: item } = await sb
    .from("quote_items")
    .select("quote_id")
    .eq("id", quoteItemId)
    .single();
  if (item) revalidateQuote(item.quote_id as string);
}

export async function removeQuoteItemPhoto(photoId: string): Promise<void> {
  const sb = supabaseServer();
  const { data: photo } = await sb
    .from("quote_item_photos")
    .select("quote_item_id, quote_items(quote_id)")
    .eq("id", photoId)
    .single();
  await sb.from("quote_item_photos").delete().eq("id", photoId);
  const quoteId = (photo?.quote_items as unknown as { quote_id: string } | null)?.quote_id;
  if (quoteId) revalidateQuote(quoteId);
}

export async function reorderQuoteItemPhotos(
  quoteItemId: string,
  orderedPhotoIds: string[]
): Promise<void> {
  const sb = supabaseServer();
  await Promise.all(
    orderedPhotoIds.map((id, index) =>
      sb.from("quote_item_photos").update({ order_index: index }).eq("id", id)
    )
  );
  const { data: item } = await sb
    .from("quote_items")
    .select("quote_id")
    .eq("id", quoteItemId)
    .single();
  if (item) revalidateQuote(item.quote_id as string);
}

export async function updateQuoteData(
  quoteId: string,
  patch: Partial<{
    title: string;
    subtitle: string;
    clientName: string;
    recipientName: string;
    recipientPosition: string;
    recipientInstitution: string;
    letterNumber: string;
    letterDate: string;
    logoId: string | null;
    signatoryId: string | null;
    removeExcludedSections: boolean;
  }>
): Promise<void> {
  const sb = supabaseServer();
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.subtitle !== undefined) row.subtitle = patch.subtitle;
  if (patch.clientName !== undefined) row.client_name = patch.clientName;
  if (patch.recipientName !== undefined) row.recipient_name = patch.recipientName;
  if (patch.recipientPosition !== undefined) row.recipient_position = patch.recipientPosition;
  if (patch.recipientInstitution !== undefined) row.recipient_institution = patch.recipientInstitution;
  if (patch.letterNumber !== undefined) row.letter_number = patch.letterNumber;
  if (patch.letterDate !== undefined) row.letter_date = patch.letterDate;
  if (patch.logoId !== undefined) row.logo_id = patch.logoId;
  if (patch.signatoryId !== undefined) row.signatory_id = patch.signatoryId;
  if (patch.removeExcludedSections !== undefined) {
    row.remove_excluded_sections = patch.removeExcludedSections;
  }
  await sb.from("quotes").update(row).eq("id", quoteId);
  revalidateQuote(quoteId);
}

export async function uploadCoverImage(quoteId: string, formData: FormData): Promise<void> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Selecciona una imagen de portada.");
  }
  const ext = file.name.split(".").pop() || "png";
  const path = `covers/${quoteId}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadFile(BUCKETS.quotePhotos, path, buffer, file.type || "image/png");
  const sb = supabaseServer();
  await sb.from("quotes").update({ cover_image_path: path }).eq("id", quoteId);
  revalidateQuote(quoteId);
}

export async function clearCoverImage(quoteId: string): Promise<void> {
  const sb = supabaseServer();
  await sb.from("quotes").update({ cover_image_path: null }).eq("id", quoteId);
  revalidateQuote(quoteId);
}

export async function approveQuote(quoteId: string): Promise<void> {
  const sb = supabaseServer();
  await sb
    .from("quotes")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", quoteId);
  revalidateQuote(quoteId);
  redirect(`/quotes/${quoteId}/final`);
}

export async function backToDraft(quoteId: string): Promise<void> {
  const sb = supabaseServer();
  await sb.from("quotes").update({ status: "draft", approved_at: null }).eq("id", quoteId);
  revalidateQuote(quoteId);
  redirect(`/quotes/${quoteId}/items`);
}

export async function generateQuote(quoteId: string): Promise<void> {
  const sb = supabaseServer();

  const { data: quote } = await sb
    .from("quotes")
    .select("status")
    .eq("id", quoteId)
    .single();
  if (!quote) throw new Error("Cotización no encontrada.");
  if (quote.status !== "approved" && quote.status !== "generated") {
    throw new Error("La cotización debe aprobarse antes de generarla.");
  }

  const buffer = await renderQuoteDocx(quoteId);

  const path = `${quoteId}/${randomUUID()}.docx`;
  await uploadFile(
    BUCKETS.generatedQuotes,
    path,
    buffer,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );

  await sb
    .from("quotes")
    .update({
      status: "generated",
      generated_storage_path: path,
      generated_at: new Date().toISOString(),
    })
    .eq("id", quoteId);

  revalidateQuote(quoteId);
}
