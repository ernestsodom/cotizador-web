import { changeAccessPassword } from "@/lib/actions/settings";
import { SubmitButton } from "@/components/SubmitButton";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>
        <p className="mt-1 text-sm text-slate-500">
          La plataforma usa una sola contraseña de acceso, compartida por quienes la utilizan.
        </p>
      </div>

      <div className={`${ui.card} max-w-md`}>
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Cambiar contraseña de acceso</h2>
        <p className="mb-4 text-xs text-slate-500">
          Al cambiarla se cierran todas las sesiones abiertas, incluida la tuya, y tendrás que
          volver a entrar con la nueva contraseña.
        </p>
        <form action={changeAccessPassword} className="space-y-4">
          <label className="block">
            <span className={ui.label}>Contraseña actual</span>
            <input type="password" name="current" required className={ui.input} />
          </label>
          <label className="block">
            <span className={ui.label}>Nueva contraseña</span>
            <input type="password" name="next" required minLength={6} className={ui.input} />
          </label>
          <label className="block">
            <span className={ui.label}>Repetir nueva contraseña</span>
            <input type="password" name="confirm" required minLength={6} className={ui.input} />
          </label>
          <SubmitButton pendingLabel="Guardando…">Cambiar contraseña</SubmitButton>
        </form>
      </div>
    </div>
  );
}
