import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { renderQuoteDocx, quoteFileName } from "@/lib/quotes/render";
import { BUCKETS, downloadFile } from "@/lib/supabase/storage";

/**
 * Streams the quote exactly as it will be delivered, without approving or
 * storing anything. This is the "borrador visual": the reviewer opens the
 * real document, and only then approves.
 *
 * If the quote carries a manually-edited override (uploaded after editing
 * the generated .docx directly in Word), that file is streamed verbatim
 * instead of re-rendering from the stored data — editing the Word file
 * itself is then what's actually reviewed and delivered.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const sb = supabaseServer();
    const { data: quote } = await sb
      .from("quotes")
      .select("title, client_name, manual_override_path")
      .eq("id", id)
      .single();

    const buffer = quote?.manual_override_path
      ? await downloadFile(BUCKETS.generatedQuotes, quote.manual_override_path as string)
      : await renderQuoteDocx(id);

    const name = quoteFileName(
      (quote?.title as string | null) ?? null,
      (quote?.client_name as string | null) ?? null
    );

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="BORRADOR - ${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "No se pudo generar el borrador.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
