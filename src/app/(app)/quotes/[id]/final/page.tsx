import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { BUCKETS, signedDownloadUrl } from "@/lib/supabase/storage";
import { generateQuote, backToDraft } from "@/lib/actions/quotes";
import { SubmitButton } from "@/components/SubmitButton";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function QuoteFinalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseServer();

  const { data: quote } = await sb.from("quotes").select("*").eq("id", id).single();
  if (!quote) notFound();

  if (quote.status === "draft") {
    return (
      <div className={`${ui.card} space-y-4`}>
        <p className="text-sm text-slate-600">
          Todavía no apruebas el borrador. Revísalo y apruébalo para poder generar la cotización
          definitiva.
        </p>
        <Link href={`/quotes/${id}/preview`} className={ui.btnPrimary}>
          Ir al borrador →
        </Link>
      </div>
    );
  }

  const downloadUrl =
    quote.status === "generated" && quote.generated_storage_path
      ? await signedDownloadUrl(BUCKETS.generatedQuotes, quote.generated_storage_path)
      : null;

  return (
    <div className="space-y-6">
      <div className={`${ui.card} space-y-4`}>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Borrador aprobado</h2>
          <p className="mt-1 text-sm text-slate-500">
            Genera el documento definitivo (.docx) para descargarlo y enviarlo.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <form action={generateQuote.bind(null, id)}>
            <SubmitButton pendingLabel="Generando…">
              {quote.status === "generated" ? "Regenerar documento" : "Generar cotización definitiva"}
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
            Cotización generada el {new Date(quote.generated_at!).toLocaleString("es-CL")}
          </p>
          <a href={downloadUrl} className={ui.btnPrimary}>
            Descargar documento (.docx)
          </a>
        </div>
      )}
    </div>
  );
}
