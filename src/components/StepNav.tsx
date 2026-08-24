"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const STEPS = [
  { href: "items", label: "1. Ítems" },
  { href: "photos", label: "2. Fotografías" },
  { href: "data", label: "3. Datos" },
  { href: "preview", label: "4. Borrador" },
  { href: "final", label: "5. Definitiva" },
];

export function StepNav({ quoteId }: { quoteId: string }) {
  const pathname = usePathname();
  return (
    <nav className="no-print flex flex-wrap gap-1 border-b border-slate-200 pb-px">
      {STEPS.map((step) => {
        const href = `/quotes/${quoteId}/${step.href}`;
        const active = pathname === href;
        return (
          <Link
            key={step.href}
            href={href}
            className={`rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium ${
              active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            {step.label}
          </Link>
        );
      })}
    </nav>
  );
}
