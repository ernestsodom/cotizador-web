// One-off smoke test: parse the sample .docx, print a summary, then render
// it back out to a .docx to eyeball the result. Not part of the app; run
// with `npx tsx scripts/smoke-test.ts <input.docx> <output.docx>`.
import fs from "node:fs";
import { parseCartaCotizacionV1 } from "../src/lib/document-parsers/carta-cotizacion-v1";
import { cartaUfV1 } from "../src/lib/quote-renderers/carta-uf-v1";

async function main() {
  const [, , inputPath, outputPath] = process.argv;
  const buf = fs.readFileSync(inputPath);
  const parsed = await parseCartaCotizacionV1(buf);

  console.log("=== META ===");
  console.log(JSON.stringify(parsed.meta, null, 2));

  console.log("\n=== IMAGES ===");
  for (const img of parsed.images) {
    console.log(
      `${img.key} header=${img.isHeaderCandidate} section=${img.sectionLabel ?? "-"} bytes=${img.data.length} type=${img.contentType}`
    );
  }

  console.log("\n=== ITEMS ===");
  for (const item of parsed.items) {
    console.log(`- ${item.name} | ${item.unitPrice} ${item.currency} | photos: ${item.suggestedImageKeys.join(",") || "-"}`);
    if (item.description) console.log(`  desc: ${item.description.slice(0, 120)}...`);
  }

  const logo = parsed.images.find((i) => i.isHeaderCandidate);

  const buffer = await cartaUfV1.generateDocx({
    title: "Propuesta comercial",
    letterCity: parsed.meta.letterCity,
    letterDateIso: parsed.meta.letterDateIso ?? new Date().toISOString().slice(0, 10),
    letterNumber: parsed.meta.letterNumber,
    recipientName: parsed.meta.recipientName,
    recipientPosition: parsed.meta.recipientPosition,
    recipientInstitution: parsed.meta.recipientInstitution,
    clientName: parsed.meta.clientNameGuess,
    introText: parsed.meta.introText,
    termsText: parsed.meta.termsText,
    considerationsText: parsed.meta.considerationsText,
    closingText: parsed.meta.closingText,
    currency: parsed.items[0]?.currency ?? "CLP",
    items: parsed.items.map((it) => ({
      name: it.name,
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      currency: it.currency,
      photos: it.suggestedImageKeys
        .map((k) => parsed.images.find((i) => i.key === k))
        .filter((i): i is NonNullable<typeof i> => !!i)
        .map((i) => ({ data: i.data, contentType: i.contentType })),
    })),
    logo: logo ? { data: logo.data, contentType: logo.contentType } : null,
    signatoryName: parsed.meta.signatoryName,
    signatoryPosition: parsed.meta.signatoryPosition,
    signatureImage: null,
  });

  fs.writeFileSync(outputPath, buffer);
  console.log(`\nWrote ${outputPath} (${buffer.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
