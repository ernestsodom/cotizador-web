"use client";

import { useFormStatus } from "react-dom";
import { ui } from "@/lib/ui";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const { pending } = useFormStatus();
  const base =
    variant === "primary" ? ui.btnPrimary : variant === "danger" ? ui.btnDanger : ui.btnSecondary;
  return (
    <button type="submit" disabled={pending} className={`${base} ${className ?? ""}`}>
      {pending ? pendingLabel ?? "Procesando…" : children}
    </button>
  );
}
