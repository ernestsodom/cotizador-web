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
    .select("id, name, included, order_index")
    .eq("quote_id", id)
    .order("order_index");

  const itemIds = (items ?? []).map((i) => i.id as string);
  const { data: photos } = itemIds.length
    ? await sb
        .from("quote_item_photos")
        .select("id, quote_item_id, storage_path, bucket, order_index")
        .in("quote_item_id", itemIds)
        .order("order_index")
    : { data: [] };

  const photosByItem = new Map<string, { id: string; url: string }[]>();
  for (const p of photos ?? []) {
    const key = p.quote_item_id as string;
    const list = photosByItem.get(key) ?? [];
    list.push({
      id: p.id as string,
      url: publicUrl((p.bucket as string) || BUCKETS.quotePhotos, p.storage_path as string)!,
    });
    photosByItem.set(key, list);
  }

  let gallery: { path: string; url: string; mediaTarget: string | null }[] = [];
  if (quote.source_document_id) {
    const { data: images } = await sb
      .from("source_document_images")
      .select("storage_path, media_target")
      .eq("source_document_id", quote.source_document_id)
      .eq("kind", "photo")
      .order("order_index");
    gallery = (images ?? []).map((i) => ({
      path: i.storage_path as string,
      url: publicUrl(BUCKETS.documentImages, i.storage_path as string)!,
      mediaTarget: (i.media_target as string | null) ?? null,
    }));
  }

  const totalPhotos = (photos ?? []).length;

  return (
    <div className="space-y-6">
      <div className={`${ui.card} border-brand-200 bg-brand-50`}>
        <p className="text-sm text-brand-900">
          Cada ítem ya trae las fotografías que venían en el documento cargado
          {totalPhotos > 0 ? ` (${totalPhotos} en total)` : ""}. Puedes quitarlas, reordenarlas,
          subir nuevas o tomar otras de la galería del documento.
        </p>
      </div>

      <div className="space-y-4">
        {(items ?? []).map((item) => (
          <div key={item.id as string} className={`${ui.card} ${item.included ? "" : "opacity-60"}`}>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{item.name as string}</h3>
              {!item.included && (
                <span className={`${ui.badge} bg-slate-100 text-slate-500`}>No incluido</span>
              )}
            </div>
            <PhotosEditor
              quoteItemId={item.id as string}
              initialPhotos={photosByItem.get(item.id as string) ?? []}
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
