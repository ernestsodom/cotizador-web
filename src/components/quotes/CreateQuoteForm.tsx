"use client";

import { useState, useTransition } from "react";
import { createQuoteFromDocument } from "@/lib/actions/quotes";
import { ui } from "@/lib/ui";

const FORMATS = [
  {
    key: "reutility_replica_v1",
    name: "Formato original (idéntico)",
    detail:
      "Usa el documento cargado como plantilla: misma tipografía, portada, logos Proexsi y Besttech, y diseño. Solo cambian los datos que edites.",
  },
  {
    key: "carta_uf_v1",
    name: "Formato moderno",
    detail:
      "Documento nuevo con una tabla de ítems limpia, totales calculados y las fotos bajo cada ítem.",
  },
];

export function CreateQuoteForm({ sourceDocumentId }: { sourceDocumentId: string }) {
  const [formatKey, setFormatKey] = useState(FORMATS[0].key);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {FORMATS.map((f) => (
          <label
            key={f.key}
            className={`cursor-pointer rounded-lg border p-4 transition-colors ${
              formatKey === f.key
                ? "border-brand-500 bg-brand-50 ring-1 ring-brand-200"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex items-start gap-2">
              <input
                type="radio"
                name="format"
                className="mt-1"
                checked={formatKey === f.key}
                onChange={() => setFormatKey(f.key)}
              />
              <div>
                <p className="text-sm font-medium text-slate-900">{f.name}</p>
                <p className="mt-1 text-xs text-slate-500">{f.detail}</p>
              </div>
            </div>
          </label>
        ))}
      </div>

      <button
        type="button"
        disabled={pending}
        className={ui.btnPrimary}
        onClick={() =>
          startTransition(() => {
            createQuoteFromDocument(sourceDocumentId, formatKey);
          })
        }
      >
        {pending ? "Creando…" : "Crear cotización"}
      </button>
    </div>
  );
}
