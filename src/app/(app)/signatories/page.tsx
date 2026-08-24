import { supabaseServer } from "@/lib/supabase/server";
import { publicUrl, BUCKETS } from "@/lib/supabase/storage";
import { createSignatory, deleteSignatory } from "@/lib/actions/signatories";
import { SubmitButton } from "@/components/SubmitButton";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function SignatoriesPage() {
  const sb = supabaseServer();
  const { data: signatories } = await sb
    .from("signatories")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Firmantes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Registra a las personas que pueden firmar una cotización (nombre, cargo y firma).
        </p>
      </div>

      <div className={ui.card}>
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Agregar Firmante</h2>
        <form action={createSignatory} className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className={ui.label}>Nombre</span>
            <input name="name" required className={ui.input} />
          </label>
          <label className="block">
            <span className={ui.label}>Cargo</span>
            <input name="position" required className={ui.input} />
          </label>
          <label className="block">
            <span className={ui.label}>Firma (imagen, opcional)</span>
            <input type="file" name="signature" accept="image/*" className="block text-sm" />
          </label>
          <SubmitButton pendingLabel="Guardando…">Agregar</SubmitButton>
        </form>
      </div>

      <div className="space-y-3">
        {(signatories ?? []).map((s) => (
          <div key={s.id} className={`${ui.card} flex items-center justify-between gap-4`}>
            <div className="flex items-center gap-4">
              {s.signature_storage_path && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={publicUrl(BUCKETS.signatures, s.signature_storage_path)!}
                  alt="Firma"
                  className="h-10 w-24 object-contain"
                />
              )}
              <div>
                <p className="text-sm font-medium text-slate-900">{s.name}</p>
                <p className="text-xs text-slate-500">{s.position}</p>
              </div>
            </div>
            <form action={deleteSignatory.bind(null, s.id)}>
              <SubmitButton variant="danger" pendingLabel="Eliminando…">
                Eliminar
              </SubmitButton>
            </form>
          </div>
        ))}
        {!signatories?.length && <p className="text-sm text-slate-500">No hay firmantes registrados.</p>}
      </div>
    </div>
  );
}
