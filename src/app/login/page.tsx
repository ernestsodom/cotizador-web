export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Cotizador</h1>
        <p className="mb-6 text-sm text-slate-500">
          Ingresa la contraseña de acceso para continuar.
        </p>
        <form action="/api/auth/login" method="POST" className="space-y-4">
          <input type="hidden" name="next" value={next ?? "/documents"} />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Contraseña
            </label>
            <input
              type="password"
              name="password"
              required
              autoFocus
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600">Contraseña incorrecta. Intenta de nuevo.</p>
          )}
          <button
            type="submit"
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
