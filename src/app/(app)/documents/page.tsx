import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { uploadAndParseDocument } from "@/lib/actions/documents";
import { SubmitButton } from "@/components/SubmitButton";
import { ui } from "@/lib/ui";
import type { DocumentStatus } from "@/lib/supabase/types";

const STATUS_LABEL: Record<DocumentStatus, string> = {
  uploaded: "Subido",
  parsing: "Analizando…",
  parsed: "Analizado",
  error: "Error",
};

const STATUS_CLASS: Record<DocumentStatus, string> = {
  uploaded: "bg-slate-100 text-slate-700",
  parsing: "bg-amber-100 text-amber-700",
  parsed: "bg-emerald-100 text-emerald-700",
  error: "bg-red-100 text-red-700",
};

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const sb = supabaseServer();
  const { data: documents } = await sb
    .from("source_documents")
    .select("id, original_filename, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Documentos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sube una carta de cotización (.docx) para analizarla y armar una cotización a partir de ella.
        </p>
      </div>

      <div className={ui.card}>
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Subir documento</h2>
        <form action={uploadAndParseDocument} className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="file"
            accept=".docx"
            required
            className="block w-full max-w-sm text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          <SubmitButton pendingLabel="Analizando…">Subir y analizar</SubmitButton>
        </form>
      </div>

      <div className={ui.card}>
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Documentos cargados</h2>
        {!documents?.length ? (
          <p className="text-sm text-slate-500">Aún no hay documentos.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between py-3">
                <div>
                  <Link
                    href={`/documents/${doc.id}`}
                    className="text-sm font-medium text-slate-900 hover:text-brand-600"
                  >
                    {doc.original_filename}
                  </Link>
                  <p className="text-xs text-slate-400">
                    {new Date(doc.created_at).toLocaleString("es-CL")}
                  </p>
                </div>
                <span className={`${ui.badge} ${STATUS_CLASS[doc.status as DocumentStatus]}`}>
                  {STATUS_LABEL[doc.status as DocumentStatus]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
