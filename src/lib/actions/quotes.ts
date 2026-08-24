"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { BUCKETS, downloadFile, uploadFile } from "@/lib/supabase/storage";
import { getQuoteRenderer } from "@/lib/quote-renderers/registry";
import type { ParsedDocumentMeta } from "@/lib/document-parsers/types";

const QUOTE_FORMAT_KEY = "carta_uf_v1";

export async function createQuoteFromDocument(sourceDocumentId: string): Promise<never> {
  const sb = supabaseServer();

  const { data: format } = await sb
    .from("quote_formats")
    .select("id")
    .eq("key", QUOTE_FORMAT_KEY)
    .single();
  if (!format) throw new Error("El formato de cotización no está configurado.");

  const { data: sourceDoc } = await sb
    .from("source_documents")
    .select("id, parsed_meta")
    .eq("id", sourceDocumentId)
    .single();
  if (!sourceDoc) throw new Error("Documento no encontrado.");

  const meta = (sourceDoc.parsed_meta ?? {}) as ParsedDocumentMeta;

  const { data: quote, error: quoteErr } = await sb
    .from("quotes")
    .insert({
      source_document_id: sourceDocumentId,
      quote_format_id: format.id,
      status: "draft",
      title: "Propuesta comercial",
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

    const { data: candidateImages } = await sb
      .from("source_document_item_images")
      .select("order_index, source_document_images(storage_path)")
      .eq("source_document_item_id", item.id)
      .order("order_index");

    let photoOrder = 0;
    for (const c of candidateImages ?? []) {
      const img = c.source_document_images as unknown as { storage_path: string } | null;
      if (!img) continue;
      await sb.from("quote_item_photos").insert({
        quote_item_id: quoteItem.id,
        storage_path: img.storage_path,
        order_index: photoOrder++,
      });
    }
  }

  redirect(`/quotes/${quote.id}/items`);
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
  if (item) revalidatePath(`/quotes/${item.quote_id}`, "layout");
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
    order_index: (maxRow?.order_index ?? -1) + 1,
  });
  revalidatePath(`/quotes/${quoteId}`, "layout");
}

export async function removeQuoteItem(quoteItemId: string): Promise<void> {
  const sb = supabaseServer();
  const { data: item } = await sb
    .from("quote_items")
    .select("quote_id")
    .eq("id", quoteItemId)
    .single();
  await sb.from("quote_items").delete().eq("id", quoteItemId);
  if (item) revalidatePath(`/quotes/${item.quote_id}`, "layout");
}

export async function addQuoteItemPhotoFromLibrary(
  quoteItemId: string,
  storagePath: string
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
    order_index: (maxRow?.order_index ?? -1) + 1,
  });
  const { data: item } = await sb
    .from("quote_items")
    .select("quote_id")
    .eq("id", quoteItemId)
    .single();
  if (item) revalidatePath(`/quotes/${item.quote_id}/photos`);
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
  await addQuoteItemPhotoFromLibrary(quoteItemId, path);
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
  if (quoteId) revalidatePath(`/quotes/${quoteId}/photos`);
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
  if (item) revalidatePath(`/quotes/${item.quote_id}/photos`);
}

export async function updateQuoteData(
  quoteId: string,
  patch: Partial<{
    title: string;
    clientName: string;
    recipientName: string;
    recipientPosition: string;
    recipientInstitution: string;
    letterNumber: string;
    letterDate: string;
    logoId: string | null;
    signatoryId: string | null;
  }>
): Promise<void> {
  const sb = supabaseServer();
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.clientName !== undefined) row.client_name = patch.clientName;
  if (patch.recipientName !== undefined) row.recipient_name = patch.recipientName;
  if (patch.recipientPosition !== undefined) row.recipient_position = patch.recipientPosition;
  if (patch.recipientInstitution !== undefined) row.recipient_institution = patch.recipientInstitution;
  if (patch.letterNumber !== undefined) row.letter_number = patch.letterNumber;
  if (patch.letterDate !== undefined) row.letter_date = patch.letterDate;
  if (patch.logoId !== undefined) row.logo_id = patch.logoId;
  if (patch.signatoryId !== undefined) row.signatory_id = patch.signatoryId;
  await sb.from("quotes").update(row).eq("id", quoteId);
  revalidatePath(`/quotes/${quoteId}`, "layout");
}

export async function approveQuote(quoteId: string): Promise<void> {
  const sb = supabaseServer();
  await sb
    .from("quotes")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", quoteId);
  revalidatePath(`/quotes/${quoteId}`, "layout");
  redirect(`/quotes/${quoteId}/final`);
}

export async function backToDraft(quoteId: string): Promise<void> {
  const sb = supabaseServer();
  await sb
    .from("quotes")
    .update({ status: "draft", approved_at: null })
    .eq("id", quoteId);
  revalidatePath(`/quotes/${quoteId}`, "layout");
  redirect(`/quotes/${quoteId}/items`);
}

export async function generateQuote(quoteId: string): Promise<void> {
  const sb = supabaseServer();

  const { data: quote } = await sb.from("quotes").select("*").eq("id", quoteId).single();
  if (!quote) throw new Error("Cotización no encontrada.");
  if (quote.status !== "approved" && quote.status !== "generated") {
    throw new Error("La cotización debe aprobarse antes de generarla.");
  }

  const { data: items } = await sb
    .from("quote_items")
    .select("*")
    .eq("quote_id", quoteId)
    .eq("included", true)
    .order("order_index");

  const itemsWithPhotos = await Promise.all(
    (items ?? []).map(async (item) => {
      const { data: photos } = await sb
        .from("quote_item_photos")
        .select("storage_path, order_index")
        .eq("quote_item_id", item.id)
        .order("order_index");
      const loaded = await Promise.all(
        (photos ?? []).map(async (p) => {
          const data = await downloadFile(BUCKETS.quotePhotos, p.storage_path).catch(() =>
            downloadFile(BUCKETS.documentImages, p.storage_path)
          );
          const ext = p.storage_path.split(".").pop()?.toLowerCase() ?? "png";
          const contentType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
          return { data, contentType };
        })
      );
      return {
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        currency: item.currency,
        photos: loaded,
      };
    })
  );

  let sourceMeta: ParsedDocumentMeta = {};
  if (quote.source_document_id) {
    const { data: sourceDoc } = await sb
      .from("source_documents")
      .select("parsed_meta")
      .eq("id", quote.source_document_id)
      .single();
    sourceMeta = (sourceDoc?.parsed_meta ?? {}) as ParsedDocumentMeta;
  }

  let logo = null;
  if (quote.logo_id) {
    const { data: logoRow } = await sb.from("logos").select("storage_path").eq("id", quote.logo_id).single();
    if (logoRow) {
      const data = await downloadFile(BUCKETS.logos, logoRow.storage_path);
      const ext = logoRow.storage_path.split(".").pop()?.toLowerCase() ?? "png";
      logo = { data, contentType: ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}` };
    }
  }

  let signatoryName: string | null = null;
  let signatoryPosition: string | null = null;
  let signatureImage = null;
  if (quote.signatory_id) {
    const { data: sig } = await sb
      .from("signatories")
      .select("name, position, signature_storage_path")
      .eq("id", quote.signatory_id)
      .single();
    if (sig) {
      signatoryName = sig.name;
      signatoryPosition = sig.position;
      if (sig.signature_storage_path) {
        const data = await downloadFile(BUCKETS.signatures, sig.signature_storage_path);
        const ext = sig.signature_storage_path.split(".").pop()?.toLowerCase() ?? "png";
        signatureImage = { data, contentType: ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}` };
      }
    }
  }

  const renderer = getQuoteRenderer(QUOTE_FORMAT_KEY);
  const buffer = await renderer.generateDocx({
    title: quote.title,
    letterCity: sourceMeta.letterCity,
    letterDateIso: quote.letter_date,
    letterNumber: quote.letter_number,
    recipientName: quote.recipient_name,
    recipientPosition: quote.recipient_position,
    recipientInstitution: quote.recipient_institution,
    clientName: quote.client_name,
    introText: sourceMeta.introText,
    termsText: sourceMeta.termsText,
    considerationsText: sourceMeta.considerationsText,
    closingText: sourceMeta.closingText,
    currency: quote.currency,
    items: itemsWithPhotos,
    logo,
    signatoryName,
    signatoryPosition,
    signatureImage,
  });

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

  revalidatePath(`/quotes/${quoteId}`, "layout");
}
