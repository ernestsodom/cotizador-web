import fs from "node:fs";
import { parseCartaCotizacionV1 } from "../src/lib/document-parsers/carta-cotizacion-v1";

const SRC = "/root/.claude/uploads/34d2a99e-ca1c-51fd-a5a6-39ee4c1e7298/cbfed043-REUTILITY_COMPLETO.docx";

async function main() {
  const parsed = await parseCartaCotizacionV1(fs.readFileSync(SRC));
  console.log("=== ANCHORS ===");
  console.log(JSON.stringify(parsed.meta.anchors, null, 1));
  console.log("\n=== META ===");
  const { anchors, introText, termsText, considerationsText, ...rest } = parsed.meta;
  console.log(JSON.stringify(rest, null, 1));
  console.log("intro chars:", introText?.length, "| terms:", termsText?.length, "| consid:", considerationsText?.length);
  console.log("\n=== IMAGES ===");
  for (const i of parsed.images) {
    console.log(` ${i.key} block=${i.blockIndex} media=${i.mediaTarget} header=${i.isHeaderCandidate} sec=${i.sectionLabel ?? "-"}`);
  }
  console.log("\n=== ITEMS ===");
  for (const it of parsed.items) {
    console.log(` row${it.tableRowIndex} "${it.name.slice(0, 60)}" ${it.unitPrice} ${it.currency}`);
    console.log(`    photos=[${it.suggestedImageKeys.join(",")}] section=${it.sectionStartBlock}..${it.sectionEndBlock}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
