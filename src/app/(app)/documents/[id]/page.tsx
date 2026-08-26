import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { publicUrl, BUCKETS } from "@/lib/supabase/storage";
import { CreateQuoteForm } from "@/components/quotes/CreateQuoteForm";
import { deleteSourceDocument } from "@/lib/actions/documents";
import { SubmitButton } from "@/components/SubmitButton";
import { formatMoney } from "@/lib/format";
import { ui } from "@/lib/ui";
import type { QuoteStatus } from "@/lib/supabase/types";

const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Borrador",
  approved: "Aprobada",
  generated: "Generada",
};

const QUOTE_STATUS_CLASS: Record<QuoteStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  approved: "bg-blue-100 text-blue-700",
  generated: "bg-emerald-100 text-emerald-700",
};

const QUOTE_STATUS_STEP: Record<QuoteStatus, string> = {
  draft: "items",
  approved: "final",
  generated: "final",
};

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseServer();

  const { data: doc } = await sb.from("source_documents").select("*").eq("id", id).single();
  if (!doc) notFound();

  const [{ data: project }, { data: quotes }] = await Promise.all([
    doc.project_id
      ? sb.from("projects").select("name").eq("id", doc.project_id).single()
      : Promise.resolve({ data: null }),
    sb
      .from("quotes")
      .select("id, title, client_name, status, created_at")
      .eq("source_document_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const { data: items } = await sb
    .from("source_document_items")
    .select("id, name, description, quantity, unit_price, currency, order_index")
    .eq("source_document_id", id)
    .order("order_index");

  const { data: itemImages } = await sb
    .from("source_document_item_images")
    .select("source_document_item_id, order_index, source_document_images(storage_path)")
    .in("source_document_item_id", (items ?? []).map((i) => i.id));

  const photosByItem = new Map<string, string[]>();
  for (const row of itemImages ?? []) {
    const img = row.source_document_images as unknown as { storage_path: string } | null;
    if (!img) continue;
    const list = photosByItem.get(row.source_document_item_id) ?? [];
    list.push(publicUrl(BUCKETS.documentImages, img.storage_path)!);
    photosByItem.set(row.source_document_item_id, list);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          {project && (
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-600">
              📁 {project.name as string}
            </p>
          )}
          <h1 className="text-2xl font-semibold text-slate-900">{doc.original_filename}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Subido el {new Date(doc.created_at).toLocaleString("es-CL")}
          </p>
        </div>
        <form action={deleteSourceDocument.bind(null, doc.id)}>
          <SubmitButton variant="danger" pendingLabel="Eliminando…">
            Eliminar
          </SubmitButton>
        </form>
      </div>

      {doc.status === "error" && (
        <div className={`${ui.card} border-red-200 bg-red-50`}>
          <p className="text-sm font-medium text-red-800">No se pudo analizar el documento</p>
          <p className="mt-1 text-sm text-red-700">{doc.error_message}</p>
        </div>
      )}

      {doc.status === "parsing" && (
        <div className={ui.card}>
          <p className="text-sm text-slate-600">Analizando el documento…</p>
        </div>
      )}

      {doc.status === "parsed" && (
        <>
          {!!quotes?.length && (
            <div className={ui.card}>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Cotizaciones creadas desde este documento
              </h2>
              <ul className="divide-y divide-slate-100">
                {quotes.map((q) => (
                  <li key={q.id as string} className="flex items-center justify-between py-2.5">
                    <Link
                      href={`/quotes/${q.id}/${QUOTE_STATUS_STEP[q.status as QuoteStatus]}`}
                      className="text-sm font-medium text-slate-900 hover:text-brand-600"
                    >
                      {(q.title as string) || "Cotización"}
                      {q.client_name ? ` — ${q.client_name}` : ""}
                    </Link>
                    <span className={`${ui.badge} ${QUOTE_STATUS_CLASS[q.status as QuoteStatus]}`}>
                      {QUOTE_STATUS_LABEL[q.status as QuoteStatus]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={ui.card}>
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {items?.length ?? 0} ítem(s) detectados
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Elige el formato de salida y crea una cotización nueva a partir de este documento.
                  Todo — ítems, precios, fotos y datos — sigue siendo editable antes de aprobarla.
                </p>
              </div>
              <CreateQuoteForm sourceDocumentId={doc.id} />
            </div>
          </div>

          <div className="space-y-3">
            {(items ?? []).map((item) => (
              <div key={item.id} className={ui.card}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900">{item.name}</h3>
                    {item.description && (
                      <p className="mt-1 whitespace-pre-line text-xs text-slate-500 line-clamp-4">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatMoney(item.unit_price, item.currency)}
                    </p>
                    <p className="text-xs text-slate-400">Cant. {item.quantity}</p>
                  </div>
                </div>
                {photosByItem.get(item.id) && (
                  <div className="mt-3 flex gap-2">
                    {photosByItem.get(item.id)!.map((src) => (
                      <div key={src} className="relative h-16 w-24 overflow-hidden rounded-md border border-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
