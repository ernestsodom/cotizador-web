import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { publicUrl, BUCKETS } from "@/lib/supabase/storage";
import { DataForm } from "@/components/quotes/DataForm";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function QuoteDataPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseServer();

  const { data: quote } = await sb.from("quotes").select("*").eq("id", id).single();
  if (!quote) notFound();

  const { data: logos } = await sb.from("logos").select("id, name, storage_path").order("created_at");
  const { data: signatories } = await sb
    .from("signatories")
    .select("id, name, position, signature_storage_path")
    .order("created_at");

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Completa los datos que aparecerán en la cotización final.
      </p>

      <DataForm
        quote={{
          id: quote.id,
          title: quote.title ?? "",
          clientName: quote.client_name ?? "",
          recipientName: quote.recipient_name ?? "",
          recipientPosition: quote.recipient_position ?? "",
          recipientInstitution: quote.recipient_institution ?? "",
          letterNumber: quote.letter_number ?? "",
          letterDate: quote.letter_date,
          logoId: quote.logo_id,
          signatoryId: quote.signatory_id,
        }}
        logos={(logos ?? []).map((l) => ({ id: l.id, name: l.name, url: publicUrl(BUCKETS.logos, l.storage_path)! }))}
        signatories={(signatories ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          position: s.position,
          signatureUrl: publicUrl(BUCKETS.signatures, s.signature_storage_path),
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
