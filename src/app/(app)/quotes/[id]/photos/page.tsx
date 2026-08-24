import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { publicUrl, BUCKETS } from "@/lib/supabase/storage";
import { PhotosEditor } from "@/components/quotes/PhotosEditor";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function QuotePhotosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseServer();

  const { data: quote } = await sb
    .from("quotes")
    .select("id, source_document_id")
    .eq("id", id)
    .single();
  if (!quote) notFound();

  const { data: items } = await sb
    .from("quote_items")
    .select("id, name, order_index")
    .eq("quote_id", id)
    .order("order_index");

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: photos } = itemIds.length
    ? await sb
        .from("quote_item_photos")
        .select("id, quote_item_id, storage_path, order_index")
        .in("quote_item_id", itemIds)
        .order("order_index")
    : { data: [] };

  const photosByItem = new Map<string, { id: string; url: string }[]>();
  for (const p of photos ?? []) {
    const list = photosByItem.get(p.quote_item_id) ?? [];
    list.push({ id: p.id, url: publicUrl(BUCKETS.quotePhotos, p.storage_path) ?? publicUrl(BUCKETS.documentImages, p.storage_path)! });
    photosByItem.set(p.quote_item_id, list);
  }

  let gallery: { path: string; url: string }[] = [];
  if (quote.source_document_id) {
    const { data: images } = await sb
      .from("source_document_images")
      .select("storage_path")
      .eq("source_document_id", quote.source_document_id)
      .eq("kind", "photo")
      .order("order_index");
    gallery = (images ?? []).map((i) => ({
      path: i.storage_path,
      url: publicUrl(BUCKETS.documentImages, i.storage_path)!,
    }));
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Cada ítem usa por defecto las fotos detectadas en el documento. Puedes quitarlas, agregar
        otras desde la galería del documento, subir nuevas o reordenarlas.
      </p>

      <div className="space-y-4">
        {(items ?? []).map((item) => (
          <div key={item.id} className={ui.card}>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">{item.name}</h3>
            <PhotosEditor
              quoteItemId={item.id}
              initialPhotos={photosByItem.get(item.id) ?? []}
              gallery={gallery}
            />
          </div>
        ))}
        {!items?.length && (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No hay ítems en esta cotización todavía. Vuelve al paso 1.
          </p>
        )}
      </div>

      <div className="flex justify-between">
        <Link href={`/quotes/${id}/items`} className={ui.btnSecondary}>
          ← Volver a ítems
        </Link>
        <Link href={`/quotes/${id}/data`} className={ui.btnPrimary}>
          Continuar a datos →
        </Link>
      </div>
    </div>
  );
}
