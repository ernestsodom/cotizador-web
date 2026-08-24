import { supabaseServer } from "@/lib/supabase/server";
import { publicUrl, BUCKETS } from "@/lib/supabase/storage";
import { createLogo, deleteLogo } from "@/lib/actions/logos";
import { SubmitButton } from "@/components/SubmitButton";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function LogosPage() {
  const sb = supabaseServer();
  const { data: logos } = await sb.from("logos").select("*").order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Logos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Registra logos (por ejemplo, de la Municipalidad) para reutilizarlos en las cotizaciones.
        </p>
      </div>

      <div className={ui.card}>
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Agregar logo</h2>
        <form action={createLogo} className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className={ui.label}>Nombre</span>
            <input name="name" required className={ui.input} />
          </label>
          <label className="block">
            <span className={ui.label}>Imagen</span>
            <input type="file" name="file" accept="image/*" required className="block text-sm" />
          </label>
          <SubmitButton pendingLabel="Subiendo…">Agregar</SubmitButton>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {(logos ?? []).map((logo) => (
          <div key={logo.id} className={`${ui.card} flex flex-col items-center gap-3 p-4`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={publicUrl(BUCKETS.logos, logo.storage_path)!}
              alt={logo.name}
              className="h-16 w-full object-contain"
            />
            <p className="text-center text-sm font-medium text-slate-800">{logo.name}</p>
            <form action={deleteLogo.bind(null, logo.id)}>
              <SubmitButton variant="danger" pendingLabel="Eliminando…">
                Eliminar
              </SubmitButton>
            </form>
          </div>
        ))}
        {!logos?.length && <p className="text-sm text-slate-500">No hay logos registrados.</p>}
      </div>
    </div>
  );
}
