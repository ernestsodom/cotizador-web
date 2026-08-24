import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { ItemsEditor } from "@/components/quotes/ItemsEditor";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function QuoteItemsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseServer();

  const { data: quote } = await sb.from("quotes").select("id, currency").eq("id", id).single();
  if (!quote) notFound();

  const { data: items } = await sb
    .from("quote_items")
    .select("id, name, description, quantity, unit_price, currency, included, order_index")
    .eq("quote_id", id)
    .order("order_index");

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Selecciona los ítems a incluir, ajusta cantidades y precios, o agrega ítems manuales.
        Todo se guarda automáticamente.
      </p>

      <ItemsEditor quoteId={id} initialItems={items ?? []} defaultCurrency={quote.currency} />

      <div className="flex justify-end">
        <Link href={`/quotes/${id}/photos`} className={ui.btnPrimary}>
          Continuar a fotografías →
        </Link>
      </div>
    </div>
  );
}
