import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { approveQuote } from "@/lib/actions/quotes";
import { SubmitButton } from "@/components/SubmitButton";
import { DocxPreview } from "@/components/quotes/DocxPreview";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function QuotePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseServer();

  const { data: quote } = await sb
    .from("quotes")
    .select("status, quote_formats(name)")
    .eq("id", id)
    .single();
  if (!quote) notFound();

  const format = quote.quote_formats as unknown as { name: string } | null;
  const isDraft = quote.status === "draft";

  return (
    <div className="space-y-6">
      <div className={`${ui.card} no-print border-brand-200 bg-brand-50`}>
        <h2 className="text-sm font-semibold text-brand-900">
          Borrador — {format?.name ?? "Cotización"}
        </h2>
        <p className="mt-1 text-sm text-brand-900/80">
          Esto es el documento real que se generará, ítem por ítem — no una aproximación. Revísalo
          con calma; puedes volver a &ldquo;Datos&rdquo; o a los pasos anteriores cuantas veces
          quieras antes de aprobar.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`/api/quotes/${id}/draft`} className={ui.btnPrimary}>
            Descargar borrador (.docx)
          </a>
          <Link href={`/quotes/${id}/data`} className={ui.btnSecondary}>
            ← Volver a editar
          </Link>
        </div>
      </div>

      {!isDraft && (
        <div className={`${ui.card} no-print border-blue-200 bg-blue-50 text-sm text-blue-800`}>
          Esta cotización ya fue aprobada. Para editarla, vuelve a borrador desde el paso 5.
        </div>
      )}

      <DocxPreview src={`/api/quotes/${id}/draft`} />

      <div className="no-print flex justify-between">
        <Link href={`/quotes/${id}/data`} className={ui.btnSecondary}>
          ← Volver a datos
        </Link>
        {isDraft ? (
          <form action={approveQuote.bind(null, id)}>
            <SubmitButton pendingLabel="Aprobando…">Aprobar borrador →</SubmitButton>
          </form>
        ) : (
          <Link href={`/quotes/${id}/final`} className={ui.btnPrimary}>
            Ir a generar →
          </Link>
        )}
      </div>
    </div>
  );
}
