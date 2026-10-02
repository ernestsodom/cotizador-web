"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadManualOverride, clearManualOverride } from "@/lib/actions/quotes";
import { ui } from "@/lib/ui";

/**
 * Lets the user take over the document entirely: download the current
 * borrador, edit it directly in Word — track changes, formatting, whatever
 * Word itself offers — and upload the result back. From then on, that file
 * (not what render.ts produces) is what the draft preview shows, what gets
 * approved, and what the final download is.
 */
export function ManualOverrideCard({
  quoteId,
  draftUrl,
  hasOverride,
}: {
  quoteId: string;
  draftUrl: string;
  hasOverride: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  return (
    <div className={`${ui.card} no-print border-slate-200 bg-slate-50 text-sm`}>
      <h3 className="font-semibold text-slate-900">¿Prefieres editarlo directamente en Word?</h3>
      {hasOverride ? (
        <>
          <p className="mt-1 text-slate-600">
            Esta cotización está mostrando una versión que editaste a mano en Word — no la que arma
            el sistema. Es la que se aprueba y se entrega.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={draftUrl} className={ui.btnSecondary}>
              Descargar esta versión
            </a>
            <button
              type="button"
              disabled={pending}
              className={ui.btnSecondary}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    await clearManualOverride(quoteId);
                    router.refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "No se pudo revertir.");
                  }
                });
              }}
            >
              {pending ? "Revirtiendo…" : "Volver a la versión del sistema"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-slate-600">
            Descarga el borrador, edítalo en Word como prefieras y súbelo de vuelta aquí — esa será
            la versión que se revise, apruebe y entregue, en vez de la que arma el sistema.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a href={draftUrl} className={ui.btnSecondary}>
              1. Descargar para editar
            </a>
            <button
              type="button"
              disabled={pending}
              className={ui.btnPrimary}
              onClick={() => inputRef.current?.click()}
            >
              {pending ? "Subiendo…" : "2. Subir versión editada"}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".docx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setError(null);
                const fd = new FormData();
                fd.set("file", file);
                startTransition(async () => {
                  try {
                    await uploadManualOverride(quoteId, fd);
                    router.refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "No se pudo subir el archivo.");
                  }
                });
                e.target.value = "";
              }}
            />
          </div>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
