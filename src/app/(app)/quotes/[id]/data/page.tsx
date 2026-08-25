import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { publicUrl, BUCKETS } from "@/lib/supabase/storage";
import { DataForm } from "@/components/quotes/DataForm";
import { ui } from "@/lib/ui";
import type { ParsedDocumentMeta } from "@/lib/document-parsers/types";

export const dynamic = "force-dynamic";

export default async function QuoteDataPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseServer();

  const { data: quote } = await sb
    .from("quotes")
    .select("*, quote_formats(key)")
    .eq("id", id)
    .single();
  if (!quote) notFound();

  const [{ data: logos }, { data: signatories }, { data: items }] = await Promise.all([
    sb.from("logos").select("id, name, storage_path").order("created_at"),
    sb.from("signatories").select("id, name, position, signature_storage_path").order("created_at"),
    sb.from("quote_items").select("included").eq("quote_id", id),
  ]);

  // the cover art that the source document already carries, as a fallback preview
  let defaultCoverUrl: string | null = null;
  if (quote.source_document_id) {
    const { data: sourceDoc } = await sb
      .from("source_documents")
      .select("parsed_meta")
      .eq("id", quote.source_document_id)
      .single();
    const meta = (sourceDoc?.parsed_meta ?? {}) as ParsedDocumentMeta;
    const coverBlock = meta.anchors?.coverImageBlock;
    if (coverBlock !== undefined) {
      const { data: img } = await sb
        .from("source_document_images")
        .select("storage_path")
        .eq("source_document_id", quote.source_document_id)
        .eq("block_index", coverBlock)
        .limit(1)
        .maybeSingle();
      if (img) defaultCoverUrl = publicUrl(BUCKETS.documentImages, img.storage_path as string);
    }
  }

  const formatKey =
    (quote.quote_formats as unknown as { key: string } | null)?.key ?? "reutility_replica_v1";

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Completa los datos que aparecerán en la cotización. Se guardan automáticamente al salir de
        cada campo.
      </p>

      <DataForm
        quote={{
          id: quote.id as string,
          formatKey,
          title: (quote.title as string) ?? "",
          subtitle: (quote.subtitle as string) ?? "",
          clientName: (quote.client_name as string) ?? "",
          recipientName: (quote.recipient_name as string) ?? "",
          recipientPosition: (quote.recipient_position as string) ?? "",
          recipientInstitution: (quote.recipient_institution as string) ?? "",
          letterNumber: (quote.letter_number as string) ?? "",
          letterDate: quote.letter_date as string,
          logoId: (quote.logo_id as string | null) ?? null,
          signatoryId: (quote.signatory_id as string | null) ?? null,
          coverImageUrl: publicUrl(BUCKETS.quotePhotos, quote.cover_image_path as string | null),
          removeExcludedSections: quote.remove_excluded_sections !== false,
        }}
        defaultCoverUrl={defaultCoverUrl}
        hasExcludedItems={(items ?? []).some((i) => !i.included)}
        logos={(logos ?? []).map((l) => ({
          id: l.id as string,
          name: l.name as string,
          url: publicUrl(BUCKETS.logos, l.storage_path as string)!,
        }))}
        signatories={(signatories ?? []).map((s) => ({
          id: s.id as string,
          name: s.name as string,
          position: s.position as string,
          signatureUrl: publicUrl(BUCKETS.signatures, s.signature_storage_path as string | null),
        }))}
      />

      <div className="flex justify-between">
        <Link href={`/quotes/${id}/photos`} className={ui.btnSecondary}>
          ← Volver a fotografías
        </Link>
        <Link href={`/quotes/${id}/preview`} className={ui.btnPrimary}>
          Ver borrador →
        </Link>
      </div>
    </div>
  );
}
