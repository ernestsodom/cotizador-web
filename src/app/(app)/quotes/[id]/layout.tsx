import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { StepNav } from "@/components/StepNav";
import { ui } from "@/lib/ui";
import type { QuoteStatus } from "@/lib/supabase/types";

const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Borrador",
  approved: "Aprobada",
  generated: "Generada",
};

const STATUS_CLASS: Record<QuoteStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  approved: "bg-blue-100 text-blue-700",
  generated: "bg-emerald-100 text-emerald-700",
};

export default async function QuoteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseServer();
  const { data: quote } = await sb
    .from("quotes")
    .select("id, title, status, client_name")
    .eq("id", id)
    .single();
  if (!quote) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {quote.title || "Cotización"}
            {quote.client_name ? ` — ${quote.client_name}` : ""}
          </h1>
        </div>
        <span className={`${ui.badge} ${STATUS_CLASS[quote.status as QuoteStatus]}`}>
          {STATUS_LABEL[quote.status as QuoteStatus]}
        </span>
      </div>

      <StepNav quoteId={id} />

      {children}
    </div>
  );
}
