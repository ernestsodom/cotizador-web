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
export const maxDuration = 60;

export default async function QuotePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseServer();

  const { data: quote } = await sb
    .from("quotes")
    .select("*, quote_formats(key, name)")
    .eq("id", id)
    .single();
  if (!quote) notFound();

  const format = quote.quote_formats as unknown as { key: string; name: string } | null;
  const isReplica = (format?.key ?? "reutility_replica_v1") === "reutility_replica_v1";

  const { data: items } = await sb
    .from("quote_items")
    .select("id, name, description, quantity, unit_price, currency, order_index")
    .eq("quote_id", id)
    .eq("included", true)
    .order("order_index");

  const itemIds = (items ?? []).map((i) => i.id as string);
  const { data: photoRows } = itemIds.length
    ? await sb
        .from("quote_item_photos")
        .select("quote_item_id, storage_path, bucket, order_index")
        .in("quote_item_id", itemIds)
        .order("order_index")
    : { data: [] };

  const photosByItem = new Map<string, string[]>();
  for (const p of photoRows ?? []) {
    const key = p.quote_item_id as string;
    const list = photosByItem.get(key) ?? [];
    list.push(
      publicUrl((p.bucket as string) || BUCKETS.quotePhotos, p.storage_path as string)!
    );
    photosByItem.set(key, list);
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
    const { data: logo } = await sb
      .from("logos")
      .select("storage_path")
      .eq("id", quote.logo_id)
      .single();
    logoUrl = logo ? publicUrl(BUCKETS.logos, logo.storage_path as string) : null;
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
        name: sig.name as string,
        position: sig.position as string,
        signatureUrl: publicUrl(BUCKETS.signatures, sig.signature_storage_path as string | null),
      };
    }
  }

  const total = (items ?? []).reduce(
    (sum, i) => sum + Number(i.quantity) * Number(i.unit_price),
    0
  );
  const isDraft = quote.status === "draft";

  return (
    <div className="space-y-6">
      <div className={`${ui.card} no-print border-brand-200 bg-brand-50`}>
        <h2 className="text-sm font-semibold text-brand-900">
          Borrador — {format?.name ?? "Formato original"}
        </h2>
        <p className="mt-1 text-sm text-brand-900/80">
          {isReplica
            ? "Descarga el borrador para verlo exactamente como quedará: se genera sobre el documento original, con su tipografía, portada y los logos de Proexsi y Besttech. Lo de abajo es solo un resumen de los datos."
            : "Así quedará la cotización. Puedes descargar el borrador para revisarlo en Word antes de aprobar."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`/api/quotes/${id}/draft`} className={ui.btnPrimary}>
            Descargar borrador (.docx)
          </a>
          <Link href={`/quotes/${id}/data`} className={ui.btnSecondary}>
            ← Volver a editar
          </Link>
        </div>
      </div>

      {!isDraft && (
        <div className={`${ui.card} no-print border-blue-200 bg-blue-50 text-sm text-blue-800`}>
          Esta cotización ya fue aprobada. Para editarla, vuelve a borrador desde el paso 5.
        </div>
      )}

      {/* --- summary of the data that will be written into the document --- */}
      <div className="mx-auto max-w-3xl rounded-lg border border-slate-300 bg-white p-10 shadow-sm print:border-0 print:shadow-none">
        {logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logoUrl} alt="Logo" className="mb-6 h-16 object-contain" />
        )}

        {quote.title ? (
          <h1 className="text-xl font-bold text-slate-900">{quote.title as string}</h1>
        ) : null}
        {quote.subtitle ? (
          <p className="mb-4 mt-1 text-sm text-slate-600">{quote.subtitle as string}</p>
        ) : null}

        <p className="mt-4 text-sm text-slate-700">
          {[meta.letterCity, formatDateEs(quote.letter_date as string)].filter(Boolean).join(", ")}.
        </p>
        {quote.letter_number ? (
          <p className="text-right text-sm text-slate-700">{quote.letter_number as string}</p>
        ) : null}

        {(quote.recipient_name || quote.recipient_institution) && (
          <div className="mt-6 text-sm text-slate-700">
            <p>Señor(a)</p>
            {quote.recipient_name ? (
              <p className="font-semibold">{quote.recipient_name as string}</p>
            ) : null}
            {quote.recipient_position ? <p>{quote.recipient_position as string}</p> : null}
            {quote.recipient_institution ? <p>{quote.recipient_institution as string}</p> : null}
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
        <div className="overflow-x-auto">
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
              {(items ?? []).map((item) => {
                const qty = Number(item.quantity);
                const price = Number(item.unit_price);
                const photos = photosByItem.get(item.id as string);
                return (
                  <Fragment key={item.id as string}>
                    <tr className="border-b border-slate-200 align-top">
                      <td className="p-2">
                        <p className="font-medium text-slate-900">{item.name as string}</p>
                        {item.description ? (
                          <p className="mt-1 whitespace-pre-line text-xs text-slate-500">
                            {(item.description as string).split("\n").slice(0, 4).join("\n")}
                          </p>
                        ) : null}
                      </td>
                      <td className="p-2 text-center">{qty}</td>
                      <td className="p-2 text-right">
                        {formatMoney(price, item.currency as string)}
                      </td>
                      <td className="p-2 text-right font-medium">
                        {formatMoney(qty * price, item.currency as string)}
                      </td>
                    </tr>
                    {photos && (
                      <tr className="border-b border-slate-200">
                        <td colSpan={4} className="p-2">
                          <div className="flex flex-wrap gap-2">
                            {photos.map((src) => (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                key={src}
                                src={src}
                                alt=""
                                className="h-20 w-28 rounded-md object-cover"
                              />
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex justify-end">
          <p className="rounded-md bg-brand-50 px-4 py-2 text-base font-bold text-slate-900">
            TOTAL: {formatMoney(total, quote.currency as string)}
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
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={signatory.signatureUrl} alt="Firma" className="h-16 object-contain" />
          ) : (
            <p className="text-slate-400">_________________________</p>
          )}
          {signatory ? (
            <>
              <p className="font-semibold text-slate-900">{signatory.name}</p>
              <p className="text-sm text-slate-700">{signatory.position}</p>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              {meta.signatoryName ?? ""}
              {meta.signatoryName ? " (del documento original)" : ""}
            </p>
          )}
        </div>
      </div>

      <div className="no-print flex justify-between">
        <Link href={`/quotes/${id}/data`} className={ui.btnSecondary}>
          ← Volver a datos
        </Link>
        {isDraft ? (
          <form action={approveQuote.bind(null, id)}>
            <SubmitButton pendingLabel="Aprobando…">Aprobar borrador →</SubmitButton>
          </form>
        ) : (
          <Link href={`/quotes/${id}/final`} className={ui.btnPrimary}>
            Ir a generar →
          </Link>
        )}
      </div>
    </div>
  );
}
