/**
 * Exercises both quote formats against the sample letter, the way the app
 * does: parse the document, then render with edited data.
 * Run: npx tsx scripts/test-formats.ts <input.docx>
 */
import fs from "node:fs";
import { parseCartaCotizacionV1 } from "../src/lib/document-parsers/carta-cotizacion-v1";
import { QUOTE_RENDERERS } from "../src/lib/quote-renderers/registry";
import { DocxEditor } from "../src/lib/docx-template/docx-editor";

const SRC =
  process.argv[2] ??
  "/root/.claude/uploads/34d2a99e-ca1c-51fd-a5a6-39ee4c1e7298/cbfed043-REUTILITY_COMPLETO.docx";

async function main() {
  const buf = fs.readFileSync(SRC);
  const parsed = await parseCartaCotizacionV1(buf);
  const img = (k: string) => parsed.images.find((i) => i.key === k)!;

  const items = parsed.items.slice(0, 3).map((it) => ({
    name: it.name,
    description: it.description,
    quantity: 1,
    unitPrice: it.unitPrice,
    currency: it.currency,
    tableRowIndex: it.tableRowIndex,
    sectionStartBlock: it.sectionStartBlock,
    sectionEndBlock: it.sectionEndBlock,
    templatePhotoTargets: it.suggestedImageKeys.map((k) => img(k).mediaTarget),
    photos: it.suggestedImageKeys.map((k) => ({
      data: img(k).data,
      contentType: img(k).contentType,
      sourceMediaTarget: img(k).mediaTarget,
    })),
  }));

  const excludedItems = parsed.items.slice(3).map((it) => ({
    name: it.name,
    quantity: 1,
    unitPrice: it.unitPrice,
    currency: it.currency,
    photos: [],
    tableRowIndex: it.tableRowIndex,
    sectionStartBlock: it.sectionStartBlock,
    sectionEndBlock: it.sectionEndBlock,
  }));

  const base = {
    title: "Propuesta comercial",
    subtitle: "Plataforma de Control Digital",
    letterCity: parsed.meta.letterCity,
    letterDateIso: "2026-09-01",
    letterNumber: "/P.42",
    recipientName: "Ana Rivera",
    recipientPosition: "Directora de Aseo y Ornato",
    recipientInstitution: "Ilustre Municipalidad de Ñuñoa",
    clientName: "Ilustre Municipalidad de Ñuñoa",
    introText: parsed.meta.introText,
    termsText: parsed.meta.termsText,
    considerationsText: parsed.meta.considerationsText,
    closingText: parsed.meta.closingText,
    currency: items[0]?.currency ?? "UF",
    items,
    excludedItems,
    removeExcludedSections: true,
    signatoryName: "César Gallardo Vuskovic",
    signatoryPosition: "Gerente General",
  };

  for (const [key, renderer] of Object.entries(QUOTE_RENDERERS)) {
    const out = await renderer.generateDocx({
      ...base,
      templateDocx: renderer.requiresTemplate ? buf : null,
      anchors: parsed.meta.anchors,
    });
    const path = `/tmp/out-${key}.docx`;
    fs.writeFileSync(path, out);

    const check = await DocxEditor.load(out);
    const blocks = check.blocks();
    const tbl = blocks.find((b) => b.name === "w:tbl");
    const rowCount = tbl ? check.rows(tbl).length : 0;
    const textLen = blocks.reduce((n, b) => n + check.text(b).length, 0);
    console.log(
      `${key.padEnd(22)} ${String(out.length).padStart(9)} bytes | ${rowCount} filas | ${textLen} chars | ${path}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
