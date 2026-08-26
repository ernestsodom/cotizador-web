import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { uploadAndParseDocument } from "@/lib/actions/documents";
import { SubmitButton } from "@/components/SubmitButton";
import { FolderPicker } from "@/components/FolderPicker";
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

const NO_FOLDER_KEY = "__none__";

export default async function DocumentsPage() {
  const sb = supabaseServer();
  const [{ data: documents }, { data: projects }] = await Promise.all([
    sb
      .from("source_documents")
      .select("id, original_filename, status, created_at, project_id")
      .order("created_at", { ascending: false }),
    sb.from("projects").select("id, name").order("name"),
  ]);

  const projectNameById = new Map((projects ?? []).map((p) => [p.id as string, p.name as string]));

  const groups = new Map<string, { name: string; documents: typeof documents }>();
  for (const doc of documents ?? []) {
    const key = (doc.project_id as string | null) ?? NO_FOLDER_KEY;
    if (!groups.has(key)) {
      groups.set(key, {
        name: key === NO_FOLDER_KEY ? "Sin carpeta" : projectNameById.get(key) ?? "Carpeta",
        documents: [],
      });
    }
    groups.get(key)!.documents!.push(doc);
  }
  // folders with documents first (most recently active), "Sin carpeta" last
  const orderedGroups = [...groups.entries()].sort(([a], [b]) => {
    if (a === NO_FOLDER_KEY) return 1;
    if (b === NO_FOLDER_KEY) return -1;
    return 0;
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Documentos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sube una carta de cotización (.docx), clasifícala en una carpeta por cliente o proyecto,
          y arma una o más cotizaciones a partir de ella.
        </p>
      </div>

      <div className={ui.card}>
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Subir documento</h2>
        <form action={uploadAndParseDocument} className="space-y-4">
          <FolderPicker projects={(projects ?? []).map((p) => ({ id: p.id as string, name: p.name as string }))} />
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="file"
              accept=".docx"
              required
              className="block w-full max-w-sm text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
            <SubmitButton pendingLabel="Analizando…">Subir y analizar</SubmitButton>
          </div>
        </form>
      </div>

      {!documents?.length ? (
        <div className={ui.card}>
          <p className="text-sm text-slate-500">Aún no hay documentos.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {orderedGroups.map(([key, group]) => (
            <div key={key} className={ui.card}>
              <h2 className="mb-4 text-sm font-semibold text-slate-900">
                📁 {group.name}
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {group.documents!.length} documento{group.documents!.length === 1 ? "" : "s"}
                </span>
              </h2>
              <ul className="divide-y divide-slate-100">
                {group.documents!.map((doc) => (
                  <li key={doc.id as string} className="flex items-center justify-between py-3">
                    <div>
                      <Link
                        href={`/documents/${doc.id}`}
                        className="text-sm font-medium text-slate-900 hover:text-brand-600"
                      >
                        {doc.original_filename as string}
                      </Link>
                      <p className="text-xs text-slate-400">
                        {new Date(doc.created_at as string).toLocaleString("es-CL")}
                      </p>
                    </div>
                    <span className={`${ui.badge} ${STATUS_CLASS[doc.status as DocumentStatus]}`}>
                      {STATUS_LABEL[doc.status as DocumentStatus]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
