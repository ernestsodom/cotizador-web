import { Fragment } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { publicUrl, BUCKETS } from "@/lib/supabase/storage";
import { approveQuote } from "@/lib/actions/quotes";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDateEs, formatMoney } from "@/lib/format";
import { ui } from "@/lib/ui";
import type { ParsedDocumentMeta } from "@/lib/document-parsers/types";

export const dynamic = "force-dynamic";

export default async function QuotePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseServer();

  const { data: quote } = await sb.from("quotes").select("*").eq("id", id).single();
  if (!quote) notFound();

  const { data: items } = await sb
    .from("quote_items")
    .select("id, name, description, quantity, unit_price, currency, included, order_index")
    .eq("quote_id", id)
    .eq("included", true)
    .order("order_index");

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: photoRows } = itemIds.length
    ? await sb
        .from("quote_item_photos")
        .select("quote_item_id, storage_path, order_index")
        .in("quote_item_id", itemIds)
        .order("order_index")
    : { data: [] };

  const photosByItem = new Map<string, string[]>();
  for (const p of photoRows ?? []) {
    const list = photosByItem.get(p.quote_item_id) ?? [];
    list.push(publicUrl(BUCKETS.quotePhotos, p.storage_path) ?? publicUrl(BUCKETS.documentImages, p.storage_path)!);
    photosByItem.set(p.quote_item_id, list);
  }

  let meta: ParsedDocumentMeta = {};
  if (quote.source_document_id) {
    const { data: sourceDoc } = await sb
      .from("source_documents")
      .select("parsed_meta")
      .eq("id", quote.source_document_id)
      .single();
    meta = (sourceDoc?.parsed_meta ?? {}) as ParsedDocumentMeta;
  }

  let logoUrl: string | null = null;
  if (quote.logo_id) {
    const { data: logo } = await sb.from("logos").select("storage_path").eq("id", quote.logo_id).single();
    logoUrl = logo ? publicUrl(BUCKETS.logos, logo.storage_path) : null;
  }

  let signatory: { name: string; position: string; signatureUrl: string | null } | null = null;
  if (quote.signatory_id) {
    const { data: sig } = await sb
      .from("signatories")
      .select("name, position, signature_storage_path")
      .eq("id", quote.signatory_id)
      .single();
    if (sig) {
      signatory = {
        name: sig.name,
        position: sig.position,
        signatureUrl: publicUrl(BUCKETS.signatures, sig.signature_storage_path),
      };
    }
  }

  const total = (items ?? []).reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const isEditable = quote.status === "draft";

  return (
    <div className="space-y-6">
      {!isEditable && (
        <div className={`${ui.card} border-blue-200 bg-blue-50 text-sm text-blue-800`}>
          Esta cotización ya fue aprobada. Para editarla, vuelve a borrador desde el paso 5.
        </div>
      )}

      <div className="no-print flex justify-between">
        <Link href={`/quotes/${id}/data`} className={ui.btnSecondary}>
          ← Volver a datos
        </Link>
        {isEditable && (
          <form action={approveQuote.bind(null, id)}>
            <SubmitButton pendingLabel="Aprobando…">Aprobar borrador →</SubmitButton>
          </form>
        )}
      </div>

      {/* --- visual document preview --- */}
      <div className="mx-auto max-w-3xl rounded-lg border border-slate-300 bg-white p-10 shadow-sm print:border-0 print:shadow-none">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo" className="mb-6 h-16 object-contain" />
        )}

        {quote.title && <h1 className="mb-4 text-xl font-bold text-slate-900">{quote.title}</h1>}

        <p className="text-sm text-slate-700">
          {[meta.letterCity, formatDateEs(quote.letter_date)].filter(Boolean).join(", ")}.
        </p>
        {quote.letter_number && (
          <p className="text-right text-sm text-slate-700">{quote.letter_number}</p>
        )}

        {(quote.recipient_name || quote.recipient_institution) && (
          <div className="mt-6 text-sm text-slate-700">
            <p>Señor(a)</p>
            {quote.recipient_name && <p className="font-semibold">{quote.recipient_name}</p>}
            {quote.recipient_position && <p>{quote.recipient_position}</p>}
            {quote.recipient_institution && <p>{quote.recipient_institution}</p>}
            <p>Presente</p>
          </div>
        )}

        <p className="mt-6 text-sm text-slate-700">De nuestra consideración:</p>

        {meta.introText && (
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            {meta.introText.split("\n\n").map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}

        <h2 className="mb-3 mt-8 text-base font-bold text-slate-900">COTIZACIÓN</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-brand-900 text-white">
              <th className="p-2 text-left">Ítem</th>
              <th className="p-2 text-center">Cant.</th>
              <th className="p-2 text-right">P. unitario</th>
              <th className="p-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => (
              <Fragment key={item.id}>
                <tr className="border-b border-slate-200 align-top">
                  <td className="p-2">
                    <p className="font-medium text-slate-900">{item.name}</p>
                    {item.description && (
                      <p className="mt-1 whitespace-pre-line text-xs text-slate-500">
                        {item.description}
                      </p>
                    )}
                  </td>
                  <td className="p-2 text-center">{item.quantity}</td>
                  <td className="p-2 text-right">{formatMoney(item.unit_price, item.currency)}</td>
                  <td className="p-2 text-right font-medium">
                    {formatMoney(item.quantity * item.unit_price, item.currency)}
                  </td>
                </tr>
                {photosByItem.get(item.id) && (
                  <tr className="border-b border-slate-200">
                    <td colSpan={4} className="p-2">
                      <div className="flex flex-wrap gap-2">
                        {photosByItem.get(item.id)!.map((src) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={src} src={src} alt="" className="h-20 w-28 rounded-md object-cover" />
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex justify-end">
          <p className="rounded-md bg-brand-50 px-4 py-2 text-base font-bold text-slate-900">
            TOTAL: {formatMoney(total, quote.currency)}
          </p>
        </div>

        {!!meta.termsText?.length && (
          <>
            <h2 className="mb-2 mt-8 text-sm font-bold text-slate-900">PLAZOS</h2>
            {meta.termsText.map((t, i) => (
              <p key={i} className="text-sm text-slate-700">
                {t}
              </p>
            ))}
          </>
        )}

        {!!meta.considerationsText?.length && (
          <>
            <h2 className="mb-2 mt-8 text-sm font-bold text-slate-900">CONSIDERACIONES</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {meta.considerationsText.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-8 text-sm text-slate-700">
          {meta.closingText || "Sin otro particular, se despide atentamente."}
        </p>

        <div className="mt-10">
          {signatory?.signatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signatory.signatureUrl} alt="Firma" className="h-16 object-contain" />
          ) : (
            <p className="text-slate-400">_________________________</p>
          )}
          {signatory && (
            <>
              <p className="font-semibold text-slate-900">{signatory.name}</p>
              <p className="text-sm text-slate-700">{signatory.position}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
