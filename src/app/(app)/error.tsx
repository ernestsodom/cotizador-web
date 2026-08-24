"use client";

import { ui } from "@/lib/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={`${ui.card} border-red-200 bg-red-50`}>
      <h2 className="mb-2 text-sm font-semibold text-red-800">Ocurrió un error</h2>
      <p className="mb-4 text-sm text-red-700">{error.message || "Inténtalo nuevamente."}</p>
      <button onClick={() => reset()} className={ui.btnSecondary}>
        Reintentar
      </button>
    </div>
  );
}
