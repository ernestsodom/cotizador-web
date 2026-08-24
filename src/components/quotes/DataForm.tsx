"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateQuoteData } from "@/lib/actions/quotes";
import { createSignatory } from "@/lib/actions/signatories";
import { ui } from "@/lib/ui";

interface QuoteData {
  id: string;
  title: string;
  clientName: string;
  recipientName: string;
  recipientPosition: string;
  recipientInstitution: string;
  letterNumber: string;
  letterDate: string;
  logoId: string | null;
  signatoryId: string | null;
}

interface LogoOption {
  id: string;
  name: string;
  url: string;
}

interface SignatoryOption {
  id: string;
  name: string;
  position: string;
  signatureUrl: string | null;
}

export function DataForm({
  quote,
  logos,
  signatories,
}: {
  quote: QuoteData;
  logos: LogoOption[];
  signatories: SignatoryOption[];
}) {
  const [form, setForm] = useState(quote);
  const [showAddSignatory, setShowAddSignatory] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function save(patch: Parameters<typeof updateQuoteData>[1]) {
    startTransition(() => {
      updateQuoteData(quote.id, patch);
    });
  }

  function field(key: keyof QuoteData, label: string, type: "text" | "date" = "text") {
    return (
      <label className="block">
        <span className={ui.label}>{label}</span>
        <input
          type={type}
          value={form[key] as string}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          onBlur={(e) => save({ [key]: e.target.value } as never)}
          className={ui.input}
        />
      </label>
    );
  }

  return (
    <div className="space-y-6">
      <div className={`${ui.card} grid gap-4 sm:grid-cols-2`}>
        {field("title", "Título de la propuesta")}
        {field("clientName", "Cliente")}
        {field("recipientName", "Dirigida a (nombre)")}
        {field("recipientPosition", "Cargo del destinatario")}
        {field("recipientInstitution", "Institución destinataria")}
        {field("letterNumber", "N° de carta")}
        {field("letterDate", "Fecha", "date")}
      </div>

      <div className={ui.card}>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Logo de la Municipalidad</h3>
        <div className="flex flex-wrap gap-3">
          {logos.map((logo) => (
            <button
              key={logo.id}
              type="button"
              onClick={() => {
                setForm((f) => ({ ...f, logoId: logo.id }));
                save({ logoId: logo.id });
              }}
              className={`flex h-20 w-32 items-center justify-center rounded-lg border-2 bg-white p-2 ${
                form.logoId === logo.id ? "border-brand-500 ring-2 ring-brand-200" : "border-slate-200"
              }`}
              title={logo.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo.url} alt={logo.name} className="max-h-full max-w-full object-contain" />
            </button>
          ))}
          {!logos.length && (
            <p className="text-sm text-slate-500">
              No hay logos registrados aún. Agrégalos desde la sección{" "}
              <a href="/logos" className="text-brand-600 underline">
                Logos
              </a>
              .
            </p>
          )}
        </div>
      </div>

      <div className={ui.card}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Firmante</h3>
          <button
            type="button"
            onClick={() => setShowAddSignatory((v) => !v)}
            className={ui.btnSecondary}
          >
            + Agregar Firmante
          </button>
        </div>

        {showAddSignatory && (
          <AddSignatoryInline
            onDone={() => {
              setShowAddSignatory(false);
              router.refresh();
            }}
          />
        )}

        <div className="mt-3 space-y-2">
          {signatories.map((s) => (
            <label
              key={s.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                form.signatoryId === s.id ? "border-brand-500 bg-brand-50" : "border-slate-200"
              }`}
            >
              <input
                type="radio"
                name="signatory"
                checked={form.signatoryId === s.id}
                onChange={() => {
                  setForm((f) => ({ ...f, signatoryId: s.id }));
                  save({ signatoryId: s.id });
                }}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">{s.name}</p>
                <p className="text-xs text-slate-500">{s.position}</p>
              </div>
              {s.signatureUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.signatureUrl} alt="Firma" className="h-8 w-20 object-contain" />
              )}
            </label>
          ))}
          {!signatories.length && !showAddSignatory && (
            <p className="text-sm text-slate-500">No hay firmantes registrados aún.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function AddSignatoryInline({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await createSignatory(formData);
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mb-3 space-y-3 rounded-lg bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={ui.label}>Nombre</span>
          <input name="name" required className={ui.input} />
        </label>
        <label className="block">
          <span className={ui.label}>Cargo</span>
          <input name="position" required className={ui.input} />
        </label>
      </div>
      <label className="block">
        <span className={ui.label}>Firma (imagen, opcional)</span>
        <input type="file" name="signature" accept="image/*" className="block text-sm" />
      </label>
      <button type="submit" disabled={pending} className={ui.btnPrimary}>
        {pending ? "Guardando…" : "Guardar firmante"}
      </button>
    </form>
  );
}
