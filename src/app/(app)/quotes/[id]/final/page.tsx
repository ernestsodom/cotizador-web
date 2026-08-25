import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { BUCKETS, signedDownloadUrl } from "@/lib/supabase/storage";
import { generateQuote, backToDraft, approveQuote } from "@/lib/actions/quotes";
import { SubmitButton } from "@/components/SubmitButton";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function QuoteFinalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseServer();

  const { data: quote } = await sb.from("quotes").select("*").eq("id", id).single();
  if (!quote) notFound();

  // Draft: don't dead-end the user — let them approve right here.
  if (quote.status === "draft") {
    return (
      <div className={`${ui.card} space-y-4`}>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Falta aprobar el borrador</h2>
          <p className="mt-1 text-sm text-slate-500">
            Revisa el borrador y apruébalo para generar la cotización definitiva. Puedes descargarlo
            primero para verlo tal como quedará.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={approveQuote.bind(null, id)}>
            <SubmitButton pendingLabel="Aprobando…">Aprobar y continuar</SubmitButton>
          </form>
          <a href={`/api/quotes/${id}/draft`} className={ui.btnSecondary}>
            Descargar borrador (.docx)
          </a>
          <Link href={`/quotes/${id}/preview`} className={ui.btnSecondary}>
            Revisar borrador
          </Link>
        </div>
      </div>
    );
  }

  const downloadUrl =
    quote.status === "generated" && quote.generated_storage_path
      ? await signedDownloadUrl(BUCKETS.generatedQuotes, quote.generated_storage_path as string)
      : null;

  return (
    <div className="space-y-6">
      <div className={`${ui.card} space-y-4`}>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Borrador aprobado</h2>
          <p className="mt-1 text-sm text-slate-500">
            Genera el documento definitivo (.docx) para descargarlo y enviarlo. Puede tardar unos
            segundos mientras se arma el archivo con sus imágenes.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <form action={generateQuote.bind(null, id)}>
            <SubmitButton pendingLabel="Generando…">
              {quote.status === "generated"
                ? "Regenerar documento"
                : "Generar cotización definitiva"}
            </SubmitButton>
          </form>
          <form action={backToDraft.bind(null, id)}>
            <SubmitButton variant="secondary" pendingLabel="Volviendo…">
              Volver a editar borrador
            </SubmitButton>
          </form>
        </div>
      </div>

      {downloadUrl && (
        <div className={`${ui.card} border-emerald-200 bg-emerald-50`}>
          <p className="mb-3 text-sm font-medium text-emerald-800">
            Cotización generada el{" "}
            {new Date(quote.generated_at as string).toLocaleString("es-CL")}
          </p>
          <a href={downloadUrl} className={ui.btnPrimary}>
            Descargar documento (.docx)
          </a>
        </div>
      )}
    </div>
  );
}
