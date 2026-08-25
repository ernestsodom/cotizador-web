import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { renderQuoteDocx, quoteFileName } from "@/lib/quotes/render";

/**
 * Streams the quote exactly as it will be delivered, without approving or
 * storing anything. This is the "borrador visual": the reviewer opens the
 * real document, and only then approves.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const buffer = await renderQuoteDocx(id);
    const sb = supabaseServer();
    const { data: quote } = await sb
      .from("quotes")
      .select("title, client_name")
      .eq("id", id)
      .single();

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
