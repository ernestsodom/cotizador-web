import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  BorderStyle,
  ShadingType,
  PositionalTab,
  PositionalTabAlignment,
  PositionalTabLeader,
  PositionalTabRelativeTo,
} from "docx";
import type { QuoteRenderer, RenderQuoteInput, RenderItem } from "./types";
import { formatDateEs, formatMoney } from "@/lib/format";
import { scaledDimensions, docxImageType } from "./image-utils";

const PAGE_WIDTH_DXA = 11906; // A4
const MARGIN_DXA = 1134; // ~2cm
const CONTENT_WIDTH_DXA = PAGE_WIDTH_DXA - MARGIN_DXA * 2;

// Same palette as the app's own UI (see tailwind.config.ts `brand` scale and
// src/lib/ui.ts), so the document a client receives reads like an extension
// of the product rather than a different piece of software.
const BRAND_900 = "1E3A8A";
const BRAND_600 = "2563EB";
const BRAND_50 = "EFF6FF";
const MUTED = "6B7280"; // slate-500
const BODY_TEXT = "1F2937"; // slate-800
const RULE_COLOR = "E2E8F0"; // slate-200

/** Right-aligns the second run against the paragraph's own tab stop. */
function rightTab() {
  return new PositionalTab({
    alignment: PositionalTabAlignment.RIGHT,
    relativeTo: PositionalTabRelativeTo.MARGIN,
    leader: PositionalTabLeader.NONE,
  });
}

/** A small brand-tinted label, the docx equivalent of the app's pill badges. */
function sectionLabel(text: string): Paragraph {
  return new Paragraph({
    shading: { type: ShadingType.CLEAR, color: "auto", fill: BRAND_50 },
    spacing: { before: 360, after: 160 },
    children: [
      new TextRun({ text: text.toUpperCase(), bold: true, size: 18, color: BRAND_600 }),
    ],
  });
}

function textParagraphs(text: string | null | undefined) {
  if (!text) return [];
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        new Paragraph({
          spacing: { after: 160 },
          children: p
            .split("\n")
            .flatMap((line, i) =>
              i === 0
                ? [new TextRun({ text: line, color: BODY_TEXT })]
                : [new TextRun({ text: line, break: 1, color: BODY_TEXT })]
            ),
        })
    );
}

function bulletParagraphs(lines: string[] | undefined) {
  if (!lines?.length) return [];
  return lines.map(
    (line) =>
      new Paragraph({
        spacing: { after: 80 },
        indent: { left: 340 },
        children: [new TextRun({ text: `•  ${line}`, color: BODY_TEXT })],
      })
  );
}

/**
 * One item, flowing top to bottom like an editorial layout rather than a
 * spreadsheet row: name and total share a line (tabbed apart, no cell
 * borders), quantity/unit price sit underneath in muted small type, then
 * the description, then photos — larger and free to wrap onto their own
 * lines instead of being squeezed into a fixed-width cell.
 */
function buildItemBlock(item: RenderItem, isLast: boolean): Paragraph[] {
  const total = item.quantity * item.unitPrice;
  const paragraphs: Paragraph[] = [];

  paragraphs.push(
    new Paragraph({
      spacing: { before: 260, after: 40 },
      children: [
        new TextRun({ text: item.name, bold: true, size: 26, color: BODY_TEXT }),
        rightTab(),
        new TextRun({ text: formatMoney(total, item.currency), bold: true, size: 26, color: BRAND_900 }),
      ],
    })
  );

  paragraphs.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: `Cantidad: ${item.quantity}   ·   Precio unitario: ${formatMoney(item.unitPrice, item.currency)}`,
          size: 18,
          color: MUTED,
        }),
      ],
    })
  );

  if (item.description) {
    for (const line of item.description.split("\n").filter(Boolean)) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: line, size: 20, color: BODY_TEXT })],
        })
      );
    }
  }

  if (item.photos.length) {
    const maxW = item.photos.length === 1 ? 420 : 280;
    const runs = item.photos.flatMap((photo, i) => {
      const { width, height } = scaledDimensions(photo.data, maxW, 300);
      const image = new ImageRun({
        data: photo.data,
        type: docxImageType(photo.contentType),
        transformation: { width, height },
      });
      return i === 0 ? [image] : [new TextRun({ text: "   " }), image];
    });
    paragraphs.push(new Paragraph({ spacing: { before: 100, after: 40 }, children: runs }));
  }

  if (!isLast) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 160, after: 0 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE_COLOR, space: 1 } },
        children: [],
      })
    );
  }

  return paragraphs;
}

function buildItemsFlow(input: RenderQuoteInput): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let grandTotal = 0;
  input.items.forEach((item, i) => {
    grandTotal += item.quantity * item.unitPrice;
    paragraphs.push(...buildItemBlock(item, i === input.items.length - 1));
  });

  // A shaded highlight box for the grand total, the same brand-tinted
  // "card" treatment the app itself uses to draw the eye to a number.
  paragraphs.push(
    new Paragraph({
      spacing: { before: 360, after: 0 },
      indent: { left: 0, right: 0 },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: BRAND_50 },
      border: { top: { style: BorderStyle.SINGLE, size: 12, color: BRAND_900, space: 8 } },
      children: [
        new TextRun({ text: "TOTAL", bold: true, size: 20, color: BRAND_900 }),
        rightTab(),
        new TextRun({ text: formatMoney(grandTotal, input.currency), bold: true, size: 34, color: BRAND_900 }),
      ],
    })
  );

  return paragraphs;
}

/**
 * The cover page: logo, an eyebrow label, the proposal's title/subtitle,
 * an optional cover photo, and who it's prepared for — the same visual
 * hierarchy the app's own wizard uses (a brand-tinted label, a big bold
 * heading, muted supporting text), just laid out for a printed page. The
 * letter itself starts fresh on page two.
 */
function buildCoverPage(input: RenderQuoteInput): Paragraph[] {
  const children: Paragraph[] = [];

  children.push(new Paragraph({ spacing: { after: 400 }, children: [] }));

  if (input.logo) {
    const { width, height } = scaledDimensions(input.logo.data, 220, 120);
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 500 },
        children: [
          new ImageRun({
            data: input.logo.data,
            type: docxImageType(input.logo.contentType),
            transformation: { width, height },
          }),
        ],
      })
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: BRAND_600, space: 8 } },
      children: [
        new TextRun({ text: "PROPUESTA COMERCIAL", bold: true, size: 20, color: BRAND_600 }),
      ],
    })
  );

  if (input.title) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 160 },
        children: [new TextRun({ text: input.title, bold: true, size: 48, color: BRAND_900 })],
      })
    );
  }
  if (input.subtitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({ text: input.subtitle, size: 24, color: MUTED })],
      })
    );
  }

  if (input.coverImage) {
    const { width, height } = scaledDimensions(input.coverImage.data, 380, 260);
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 500 },
        children: [
          new ImageRun({
            data: input.coverImage.data,
            type: docxImageType(input.coverImage.contentType),
            transformation: { width, height },
          }),
        ],
      })
    );
  }

  if (input.clientName) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 300, after: 40 },
        children: [new TextRun({ text: "PREPARADO PARA", size: 18, color: MUTED, bold: true })],
      })
    );
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 500 },
        children: [new TextRun({ text: input.clientName, bold: true, size: 30, color: BODY_TEXT })],
      })
    );
  }

  const dateLine = [input.letterCity, formatDateEs(input.letterDateIso)].filter(Boolean).join(", ");
  const footerBits = [dateLine ? `${dateLine}.` : null, input.letterNumber].filter(Boolean);
  if (footerBits.length) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 600 },
        children: [new TextRun({ text: footerBits.join("   ·   "), size: 20, color: MUTED })],
      })
    );
  }

  return children;
}

async function generateDocx(input: RenderQuoteInput): Promise<Buffer> {
  const children: Paragraph[] = buildCoverPage(input);

  // ---- letter, starting fresh on page two ----
  // An empty paragraph carrying just the page break, rather than grafting
  // pageBreakBefore onto whichever real paragraph happens to come first —
  // docx-js doesn't expose a Paragraph's own options back out, so rebuilding
  // one from a "read it back" helper risks silently dropping its content.
  const letterOpen: Paragraph[] = [new Paragraph({ pageBreakBefore: true, children: [] })];
  const dateLine = [input.letterCity, formatDateEs(input.letterDateIso)].filter(Boolean).join(", ");
  if (dateLine) {
    letterOpen.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun(`${dateLine}.`)] }));
  }
  if (input.letterNumber) {
    letterOpen.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 300 },
        children: [new TextRun(input.letterNumber)],
      })
    );
  }

  if (input.recipientName || input.recipientInstitution) {
    letterOpen.push(new Paragraph({ children: [new TextRun("Señor(a)")] }));
    if (input.recipientName) {
      letterOpen.push(
        new Paragraph({ children: [new TextRun({ text: input.recipientName, bold: true })] })
      );
    }
    if (input.recipientPosition) {
      letterOpen.push(new Paragraph({ children: [new TextRun(input.recipientPosition)] }));
    }
    if (input.recipientInstitution) {
      letterOpen.push(new Paragraph({ children: [new TextRun(input.recipientInstitution)] }));
    }
    letterOpen.push(new Paragraph({ spacing: { after: 300 }, children: [new TextRun("Presente")] }));
  }

  letterOpen.push(
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun("De nuestra consideración:")] })
  );

  children.push(...letterOpen);

  children.push(...textParagraphs(input.introText));

  children.push(sectionLabel("Cotización"));
  children.push(...buildItemsFlow(input));

  if (input.termsText?.length) {
    children.push(sectionLabel("Plazos"));
    children.push(
      ...input.termsText.map((t) => new Paragraph({ spacing: { after: 100 }, children: [new TextRun(t)] }))
    );
  }

  if (input.considerationsText?.length) {
    children.push(sectionLabel("Consideraciones"));
    children.push(...bulletParagraphs(input.considerationsText));
  }

  children.push(
    new Paragraph({
      spacing: { before: 400, after: 200 },
      children: [new TextRun(input.closingText || "Sin otro particular, se despide atentamente.")],
    })
  );

  if (input.signatureImage) {
    const { width, height } = scaledDimensions(input.signatureImage.data, 160, 80);
    children.push(
      new Paragraph({
        spacing: { before: 200 },
        children: [
          new ImageRun({
            data: input.signatureImage.data,
            type: docxImageType(input.signatureImage.contentType),
            transformation: { width, height },
          }),
        ],
      })
    );
  } else {
    children.push(
      new Paragraph({ spacing: { before: 200 }, children: [new TextRun("_________________________")] })
    );
  }
  if (input.signatoryName) {
    children.push(new Paragraph({ children: [new TextRun({ text: input.signatoryName, bold: true })] }));
  }
  if (input.signatoryPosition) {
    children.push(new Paragraph({ children: [new TextRun(input.signatoryPosition)] }));
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH_DXA, height: 16838 },
            margin: { top: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA, right: MARGIN_DXA },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export const cartaUfV1: QuoteRenderer = {
  key: "carta_uf_v1",
  name: "Carta moderna con tabla de ítems",
  requiresTemplate: false,
  generateDocx,
};
