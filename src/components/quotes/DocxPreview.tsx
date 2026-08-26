"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders the actual generated .docx in the browser — not a hand-built
 * approximation — so what the reviewer sees here is what gets delivered.
 * Uses docx-preview (client-side only, it manipulates the DOM directly),
 * fetching the same endpoint the "Descargar borrador" button uses.
 */
export function DocxPreview({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setStatus("loading");
      setError(null);
      try {
        const res = await fetch(src, { cache: "no-store" });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            (body?.error as string) ?? `No se pudo generar el borrador (HTTP ${res.status}).`
          );
        }
        const blob = await res.blob();
        const { renderAsync } = await import("docx-preview");
        if (cancelled || !containerRef.current || !styleRef.current) return;

        containerRef.current.innerHTML = "";
        styleRef.current.innerHTML = "";
        await renderAsync(blob, containerRef.current, styleRef.current, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          experimental: true,
        });
        if (!cancelled) setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "No se pudo generar la vista previa.");
          setStatus("error");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div>
      <div ref={styleRef} />
      {status === "loading" && (
        <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-white py-24">
          <p className="text-sm text-slate-500">Generando vista previa del documento…</p>
        </div>
      )}
      {status === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      <div
        ref={containerRef}
        className="docx-preview-host overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-4"
        style={{ display: status === "ready" ? "block" : "none" }}
      />
    </div>
  );
}
