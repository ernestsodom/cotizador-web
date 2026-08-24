"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { BUCKETS } from "@/lib/supabase/storage";
import { getDocumentParser } from "@/lib/document-parsers/registry";

const DOCUMENT_TYPE_KEY = "carta_cotizacion_v1";

export async function uploadAndParseDocument(formData: FormData): Promise<void> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Selecciona un archivo .docx para continuar.");
  }

  const sb = supabaseServer();
  const { data: docType, error: docTypeErr } = await sb
    .from("document_types")
    .select("id")
    .eq("key", DOCUMENT_TYPE_KEY)
    .single();
  if (docTypeErr || !docType) {
    throw new Error("El tipo de documento no está configurado en la base de datos.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${randomUUID()}-${file.name}`;

  const { error: uploadErr } = await sb.storage
    .from(BUCKETS.sourceDocuments)
    .upload(storagePath, buffer, {
      contentType:
        file.type ||
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  if (uploadErr) {
    throw new Error(`No se pudo subir el archivo: ${uploadErr.message}`);
  }

  const { data: sourceDoc, error: insertErr } = await sb
    .from("source_documents")
    .insert({
      document_type_id: docType.id,
      original_filename: file.name,
      storage_path: storagePath,
      status: "parsing",
    })
    .select("id")
    .single();
  if (insertErr || !sourceDoc) {
    throw new Error("No se pudo registrar el documento en la base de datos.");
  }

  await parseSourceDocument(sourceDoc.id, buffer);

  revalidatePath("/documents");
  redirect(`/documents/${sourceDoc.id}`);
}

async function parseSourceDocument(sourceDocumentId: string, buffer: Buffer) {
  const sb = supabaseServer();
  try {
    const parser = getDocumentParser(DOCUMENT_TYPE_KEY);
    const parsed = await parser(buffer);

    const imageIdByKey = new Map<string, string>();
    let imageOrder = 0;
    for (const img of parsed.images) {
      const ext = img.contentType.split("/")[1] || "png";
      const path = `${sourceDocumentId}/${img.key}.${ext}`;
      const { error: upErr } = await sb.storage
        .from(BUCKETS.documentImages)
        .upload(path, img.data, { contentType: img.contentType, upsert: true });
      if (upErr) continue;

      const { data: imgRow } = await sb
        .from("source_document_images")
        .insert({
          source_document_id: sourceDocumentId,
          storage_path: path,
          kind: img.isHeaderCandidate ? "logo_candidate" : "photo",
          section_label: img.sectionLabel ?? null,
          order_index: imageOrder++,
        })
        .select("id")
        .single();
      if (imgRow) imageIdByKey.set(img.key, imgRow.id);
    }

    let itemOrder = 0;
    for (const item of parsed.items) {
      const { data: itemRow } = await sb
        .from("source_document_items")
        .insert({
          source_document_id: sourceDocumentId,
          name: item.name,
          description: item.description ?? null,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          currency: item.currency,
          order_index: itemOrder++,
        })
        .select("id")
        .single();
      if (!itemRow) continue;

      let imgOrder = 0;
      for (const key of item.suggestedImageKeys) {
        const imageId = imageIdByKey.get(key);
        if (!imageId) continue;
        await sb.from("source_document_item_images").insert({
          source_document_item_id: itemRow.id,
          source_document_image_id: imageId,
          order_index: imgOrder++,
        });
      }
    }

    await sb
      .from("source_documents")
      .update({ status: "parsed", parsed_meta: parsed.meta })
      .eq("id", sourceDocumentId);
  } catch (e) {
    await sb
      .from("source_documents")
      .update({
        status: "error",
        error_message: e instanceof Error ? e.message : String(e),
      })
      .eq("id", sourceDocumentId);
  }
}

export async function deleteSourceDocument(sourceDocumentId: string): Promise<void> {
  const sb = supabaseServer();
  await sb.from("source_documents").delete().eq("id", sourceDocumentId);
  revalidatePath("/documents");
  redirect("/documents");
}
