import fs from "node:fs";
import JSZip from "jszip";
import { DocxEditor } from "../src/lib/docx-template/docx-editor";

const SRC = "/root/.claude/uploads/34d2a99e-ca1c-51fd-a5a6-39ee4c1e7298/cbfed043-REUTILITY_COMPLETO.docx";

async function docXml(buf: Buffer): Promise<string> {
  const z = await JSZip.loadAsync(buf);
  return z.file("word/document.xml")!.async("string");
}

async function main() {
  const original = fs.readFileSync(SRC);
  const originalXml = await docXml(original);

  // 1) no-op round trip must be byte-identical
  const noop = await DocxEditor.load(original);
  const noopOut = await noop.save();
  const noopXml = await docXml(noopOut);
  console.log("no-op round trip identical:", noopXml === originalXml);
  if (noopXml !== originalXml) {
    for (let i = 0; i < Math.max(noopXml.length, originalXml.length); i++) {
      if (noopXml[i] !== originalXml[i]) {
        console.log("first diff at", i);
        console.log("orig:", JSON.stringify(originalXml.slice(i - 80, i + 80)));
        console.log("new :", JSON.stringify(noopXml.slice(i - 80, i + 80)));
        break;
      }
    }
  }

  // 2) block indexing matches what the parser sees
  const ed = await DocxEditor.load(original);
  const blocks = ed.blocks();
  console.log("blocks:", blocks.length);
  console.log("block[15]:", JSON.stringify(ed.text(blocks[15] ?? blocks[0])));
  const tbl = blocks.find((b) => b.name === "w:tbl")!;
  console.log("table rows:", ed.rows(tbl).length);
  console.log("row1 cells:", ed.rows(tbl)[1] ? ed.cells(ed.rows(tbl)[1]).map((c) => ed.text(c)) : null);

  // 3) targeted edits
  const paras = blocks.filter((b) => b.name === "w:p");
  const dateP = paras.find((p) => /de Junio de 2026/.test(ed.text(p)))!;
  ed.setParagraphText(dateP, "Valparaíso, 3 de marzo de 2027.");
  const titleP = paras.find((p) => ed.text(p).trim() === "Propuesta comercial")!;
  ed.setParagraphText(titleP, "Propuesta comercial 2027");

  const rows = ed.rows(tbl);
  ed.setCellText(ed.cells(rows[1])[0], "Módulo de Administración (editado)");
  ed.setCellText(ed.cells(rows[1])[1], "31,90");
  ed.remove(rows[4]); // drop an item
  ed.cloneRowAfter(rows[1], rows[5], ["Ítem agregado a mano", "9,99"]);

  const out = await ed.save();
  fs.writeFileSync("/tmp/edited.docx", out);

  const check = await DocxEditor.load(out);
  const cblocks = check.blocks();
  const ctbl = cblocks.find((b) => b.name === "w:tbl")!;
  console.log("\n--- after edit ---");
  console.log("title:", JSON.stringify(check.text(cblocks.filter((b) => b.name === "w:p").find((p) => /Propuesta/.test(check.text(p)))!)));
  console.log("date :", JSON.stringify(check.text(cblocks.filter((b) => b.name === "w:p").find((p) => /2027/.test(check.text(p)) && /,/.test(check.text(p)))!)));
  for (const r of check.rows(ctbl)) {
    console.log("  row:", check.cells(r).map((c) => check.text(c)));
  }
  console.log("size:", out.length);
}

main().catch((e) => { console.error(e); process.exit(1); });
