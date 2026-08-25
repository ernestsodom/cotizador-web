"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateQuoteData,
  setQuoteFormat,
  uploadCoverImage,
  clearCoverImage,
} from "@/lib/actions/quotes";
import { createSignatory } from "@/lib/actions/signatories";
import { createLogo } from "@/lib/actions/logos";
import { ui } from "@/lib/ui";

interface QuoteData {
  id: string;
  formatKey: string;
  title: string;
  subtitle: string;
  clientName: string;
  recipientName: string;
  recipientPosition: string;
  recipientInstitution: string;
  letterNumber: string;
  letterDate: string;
  logoId: string | null;
  signatoryId: string | null;
  coverImageUrl: string | null;
  removeExcludedSections: boolean;
}

interface LogoOption { id: string; name: string; url: string }
interface SignatoryOption { id: string; name: string; position: string; signatureUrl: string | null }

const FORMATS = [
  { key: "reutility_replica_v1", label: "Formato original (idéntico al documento cargado)" },
  { key: "carta_uf_v1", label: "Formato moderno" },
];

export function DataForm({
  quote,
  logos,
  signatories,
  defaultCoverUrl,
  hasExcludedItems,
}: {
  quote: QuoteData;
  logos: LogoOption[];
  signatories: SignatoryOption[];
  defaultCoverUrl: string | null;
  hasExcludedItems: boolean;
}) {
  const [form, setForm] = useState(quote);
  const [showAddSignatory, setShowAddSignatory] = useState(false);
  const [showAddLogo, setShowAddLogo] = useState(false);
  const [, startTransition] = useTransition();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const isReplica = form.formatKey === "reutility_replica_v1";

  function save(patch: Parameters<typeof updateQuoteData>[1]) {
    startTransition(() => {
      updateQuoteData(quote.id, patch);
    });
  }

  function field(key: keyof QuoteData, label: string, type: "text" | "date" = "text", hint?: string) {
    return (
      <label className="block">
        <span className={ui.label}>{label}</span>
        <input
          type={type}
          value={(form[key] as string) ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          onBlur={(e) => save({ [key]: e.target.value } as never)}
          className={ui.input}
        />
        {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
      </label>
    );
  }

  return (
    <div className="space-y-6">
      <div className={ui.card}>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Formato de la cotización</h3>
        <div className="space-y-2">
          {FORMATS.map((f) => (
            <label key={f.key} className="flex items-center gap-3 text-sm text-slate-700">
              <input
                type="radio"
                name="quote-format"
                checked={form.formatKey === f.key}
                onChange={() => {
                  setForm((prev) => ({ ...prev, formatKey: f.key }));
                  startTransition(() => {
                    setQuoteFormat(quote.id, f.key);
                  });
                }}
              />
              {f.label}
            </label>
          ))}
        </div>
        {isReplica && (
          <p className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
            El documento final se genera sobre el archivo original: conserva tipografía, portada,
            logos de Proexsi y Besttech, y el diseño completo. Solo se reemplazan los datos que
            edites aquí.
          </p>
        )}
      </div>

      <div className={`${ui.card} grid gap-4 sm:grid-cols-2`}>
        {field("title", "Título de la portada")}
        {field("subtitle", "Bajada / subtítulo de la portada")}
        {field("clientName", "Cliente")}
        {field("recipientName", "Dirigida a (nombre)")}
        {field("recipientPosition", "Cargo del destinatario")}
        {field("recipientInstitution", "Institución destinataria")}
        {field("letterNumber", "N° de carta")}
        {field("letterDate", "Fecha", "date")}
      </div>

      <div className={ui.card}>
        <h3 className="mb-1 text-sm font-semibold text-slate-900">Imagen de portada</h3>
        <p className="mb-3 text-xs text-slate-500">
          Por defecto se usa la imagen que trae el documento cargado.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          {(form.coverImageUrl || defaultCoverUrl) && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={form.coverImageUrl || defaultCoverUrl!}
              alt="Portada"
              className="h-24 w-40 rounded-lg border border-slate-200 object-contain p-1"
            />
          )}
          <div className="flex gap-2">
            <button type="button" className={ui.btnSecondary} onClick={() => coverInputRef.current?.click()}>
              Cambiar imagen
            </button>
            {form.coverImageUrl && (
              <button
                type="button"
                className={ui.btnSecondary}
                onClick={() => {
                  setForm((f) => ({ ...f, coverImageUrl: null }));
                  startTransition(() => {
                    clearCoverImage(quote.id);
                  });
                }}
              >
                Usar la del documento
              </button>
            )}
          </div>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const fd = new FormData();
              fd.set("file", file);
              const preview = URL.createObjectURL(file);
              setForm((f) => ({ ...f, coverImageUrl: preview }));
              startTransition(async () => {
                await uploadCoverImage(quote.id, fd);
                router.refresh();
              });
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className={ui.card}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Logo del cliente / Municipalidad</h3>
            <p className="text-xs text-slate-500">Reemplaza el logo que aparece en la portada.</p>
          </div>
          <button type="button" onClick={() => setShowAddLogo((v) => !v)} className={ui.btnSecondary}>
            + Agregar logo
          </button>
        </div>

        {showAddLogo && (
          <InlineUpload
            fields={[{ name: "name", label: "Nombre", type: "text" }]}
            fileField={{ name: "file", label: "Imagen" }}
            action={createLogo}
            onDone={() => {
              setShowAddLogo(false);
              router.refresh();
            }}
          />
        )}

        <div className="mt-3 flex flex-wrap gap-3">
          {logos.map((logo) => (
            <button
              key={logo.id}
              type="button"
              onClick={() => {
                const next = form.logoId === logo.id ? null : logo.id;
                setForm((f) => ({ ...f, logoId: next }));
                save({ logoId: next });
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
          {!logos.length && !showAddLogo && (
            <p className="text-sm text-slate-500">
              Sin logos guardados. Si no eliges uno, se mantiene el del documento original.
            </p>
          )}
        </div>
      </div>

      <div className={ui.card}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Firmante</h3>
          <button type="button" onClick={() => setShowAddSignatory((v) => !v)} className={ui.btnSecondary}>
            + Agregar Firmante
          </button>
        </div>

        {showAddSignatory && (
          <InlineUpload
            fields={[
              { name: "name", label: "Nombre", type: "text" },
              { name: "position", label: "Cargo", type: "text" },
            ]}
            fileField={{ name: "signature", label: "Firma (imagen, opcional)", optional: true }}
            action={createSignatory}
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
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={s.signatureUrl} alt="Firma" className="h-8 w-20 object-contain" />
              )}
            </label>
          ))}
          {!signatories.length && !showAddSignatory && (
            <p className="text-sm text-slate-500">
              Sin firmantes guardados. Si no eliges uno, se mantiene el del documento original.
            </p>
          )}
        </div>
      </div>

      {isReplica && hasExcludedItems && (
        <div className={ui.card}>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.removeExcludedSections}
              onChange={(e) => {
                setForm((f) => ({ ...f, removeExcludedSections: e.target.checked }));
                save({ removeExcludedSections: e.target.checked });
              }}
            />
            <span className="text-sm text-slate-700">
              Quitar del documento las secciones descriptivas de los ítems que no incluiste
              <span className="mt-0.5 block text-xs text-slate-500">
                Si lo desmarcas, el documento mantiene todas las descripciones aunque el ítem no
                aparezca en la tabla de precios.
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

function InlineUpload({
  fields,
  fileField,
  action,
  onDone,
}: {
  fields: { name: string; label: string; type: string }[];
  fileField: { name: string; label: string; optional?: boolean };
  action: (formData: FormData) => Promise<void>;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          try {
            await action(formData);
            onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo guardar.");
          }
        });
      }}
      className="space-y-3 rounded-lg bg-slate-50 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.name} className="block">
            <span className={ui.label}>{f.label}</span>
            <input name={f.name} type={f.type} required className={ui.input} />
          </label>
        ))}
      </div>
      <label className="block">
        <span className={ui.label}>{fileField.label}</span>
        <input
          type="file"
          name={fileField.name}
          accept="image/*"
          required={!fileField.optional}
          className="block text-sm"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending} className={ui.btnPrimary}>
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
