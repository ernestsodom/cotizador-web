import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
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
const BRAND_COLOR = "1E3A8A";
const MUTED_COLOR = "6B7280";
const RULE_COLOR = "E2E8F0";

/** Right-aligns the second run against the paragraph's own tab stop. */
function rightTab() {
  return new PositionalTab({
    alignment: PositionalTabAlignment.RIGHT,
    relativeTo: PositionalTabRelativeTo.MARGIN,
    leader: PositionalTabLeader.NONE,
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
            .flatMap((line, i) => (i === 0 ? [new TextRun(line)] : [new TextRun({ text: line, break: 1 })])),
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
        children: [new TextRun(`•  ${line}`)],
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
        new TextRun({ text: item.name, bold: true, size: 26 }),
        rightTab(),
        new TextRun({ text: formatMoney(total, item.currency), bold: true, size: 26, color: BRAND_COLOR }),
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
          color: MUTED_COLOR,
        }),
      ],
    })
  );

  if (item.description) {
    for (const line of item.description.split("\n").filter(Boolean)) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: line, size: 20, color: "374151" })],
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

  paragraphs.push(
    new Paragraph({
      spacing: { before: 320 },
      border: { top: { style: BorderStyle.SINGLE, size: 12, color: BRAND_COLOR, space: 4 } },
      children: [
        new TextRun({ text: "TOTAL", bold: true, size: 22, color: MUTED_COLOR }),
        rightTab(),
        new TextRun({ text: formatMoney(grandTotal, input.currency), bold: true, size: 32, color: BRAND_COLOR }),
      ],
    })
  );

  return paragraphs;
}

async function generateDocx(input: RenderQuoteInput): Promise<Buffer> {
  const children: Paragraph[] = [];

  if (input.logo) {
    const { width, height } = scaledDimensions(input.logo.data, 160, 90);
    children.push(
      new Paragraph({
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

  if (input.title) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 200, after: 200 },
        children: [new TextRun({ text: input.title, bold: true, size: 30 })],
      })
    );
  }
  if (input.subtitle) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: input.subtitle, size: 22, color: MUTED_COLOR })],
      })
    );
  }

  const dateLine = [input.letterCity, formatDateEs(input.letterDateIso)].filter(Boolean).join(", ");
  if (dateLine) {
    children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun(`${dateLine}.`)] }));
  }
  if (input.letterNumber) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 300 },
        children: [new TextRun(input.letterNumber)],
      })
    );
  }

  if (input.recipientName || input.recipientInstitution) {
    children.push(new Paragraph({ children: [new TextRun("Señor(a)")] }));
    if (input.recipientName) {
      children.push(
        new Paragraph({ children: [new TextRun({ text: input.recipientName, bold: true })] })
      );
    }
    if (input.recipientPosition) {
      children.push(new Paragraph({ children: [new TextRun(input.recipientPosition)] }));
    }
    if (input.recipientInstitution) {
      children.push(new Paragraph({ children: [new TextRun(input.recipientInstitution)] }));
    }
    children.push(new Paragraph({ spacing: { after: 300 }, children: [new TextRun("Presente")] }));
  }

  children.push(
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun("De nuestra consideración:")] })
  );

  children.push(...textParagraphs(input.introText));

  children.push(
    new Paragraph({
      spacing: { before: 200, after: 40 },
      children: [new TextRun({ text: "COTIZACIÓN", bold: true, size: 24, color: BRAND_COLOR })],
    })
  );
  children.push(...buildItemsFlow(input));

  if (input.termsText?.length) {
    children.push(
      new Paragraph({
        spacing: { before: 400, after: 120 },
        children: [new TextRun({ text: "PLAZOS", bold: true, size: 22 })],
      })
    );
    children.push(
      ...input.termsText.map((t) => new Paragraph({ spacing: { after: 100 }, children: [new TextRun(t)] }))
    );
  }

  if (input.considerationsText?.length) {
    children.push(
      new Paragraph({
        spacing: { before: 300, after: 120 },
        children: [new TextRun({ text: "CONSIDERACIONES", bold: true, size: 22 })],
      })
    );
    children.push(...bulletParagraphs(input.considerationsText));
  }

  children.push(
    new Paragraph({
      spacing: { before: 300, after: 200 },
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
