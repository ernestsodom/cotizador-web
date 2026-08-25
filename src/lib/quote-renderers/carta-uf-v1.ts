import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
  HeadingLevel,
} from "docx";
import type { QuoteRenderer, RenderQuoteInput, RenderItem } from "./types";
import { formatDateEs, formatMoney } from "@/lib/format";
import { scaledDimensions, docxImageType } from "./image-utils";

const PAGE_WIDTH_DXA = 11906; // A4
const MARGIN_DXA = 1134; // ~2cm
const CONTENT_WIDTH_DXA = PAGE_WIDTH_DXA - MARGIN_DXA * 2;

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
          children: p.split("\n").flatMap((line, i) =>
            i === 0
              ? [new TextRun(line)]
              : [new TextRun({ text: line, break: 1 })]
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
        children: [new TextRun(`•  ${line}`)],
      })
  );
}

function itemImageRow(item: RenderItem): TableRow | null {
  if (!item.photos.length) return null;
  const maxW = Math.min(160, Math.floor(CONTENT_WIDTH_DXA / 20 / item.photos.length));
  const images = item.photos.map((photo) => {
    const { width, height } = scaledDimensions(photo.data, maxW, 120);
    return new ImageRun({
      data: photo.data,
      type: docxImageType(photo.contentType),
      transformation: { width, height },
    });
  });
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 4,
        margins: { top: 80, bottom: 160, left: 100, right: 100 },
        borders: NO_BORDERS,
        children: [
          new Paragraph({
            children: images.flatMap((img, i) => (i === 0 ? [img] : [new TextRun({ text: "  " }), img])),
          }),
        ],
      }),
    ],
  });
}

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

const CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "D9DEE6" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9DEE6" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "D9DEE6" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "D9DEE6" },
};

function headerCell(text: string, width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: "1E3A8A", color: "auto" },
    borders: CELL_BORDERS,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 20 })],
      }),
    ],
  });
}

function bodyCell(
  paragraphRuns: TextRun[][],
  width: number,
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT
) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: CELL_BORDERS,
    margins: { top: 100, bottom: 100, left: 100, right: 100 },
    verticalAlign: "center",
    children: paragraphRuns.map((runs) => new Paragraph({ alignment, children: runs })),
  });
}

function buildItemsTable(input: RenderQuoteInput) {
  const colWidths = [
    Math.round(CONTENT_WIDTH_DXA * 0.42),
    Math.round(CONTENT_WIDTH_DXA * 0.13),
    Math.round(CONTENT_WIDTH_DXA * 0.2),
    Math.round(CONTENT_WIDTH_DXA * 0.25),
  ];

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell("Ítem", colWidths[0]),
      headerCell("Cant.", colWidths[1]),
      headerCell("Precio unitario", colWidths[2]),
      headerCell("Total", colWidths[3]),
    ],
  });

  const rows: TableRow[] = [headerRow];

  let grandTotal = 0;
  for (const item of input.items) {
    const total = item.quantity * item.unitPrice;
    grandTotal += total;

    const nameParas: TextRun[][] = [[new TextRun({ text: item.name, bold: true })]];
    if (item.description) {
      for (const line of item.description.split("\n").filter(Boolean).slice(0, 6)) {
        nameParas.push([new TextRun({ text: line, size: 18, color: "555555" })]);
      }
    }

    rows.push(
      new TableRow({
        children: [
          bodyCell(nameParas, colWidths[0]),
          bodyCell([[new TextRun(String(item.quantity))]], colWidths[1], AlignmentType.CENTER),
          bodyCell(
            [[new TextRun(formatMoney(item.unitPrice, item.currency))]],
            colWidths[2],
            AlignmentType.RIGHT
          ),
          bodyCell(
            [[new TextRun({ text: formatMoney(total, item.currency), bold: true })]],
            colWidths[3],
            AlignmentType.RIGHT
          ),
        ],
      })
    );

    const imgRow = itemImageRow(item);
    if (imgRow) rows.push(imgRow);
  }

  rows.push(
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 3,
          borders: NO_BORDERS,
          margins: { top: 120, right: 100 },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: "TOTAL", bold: true })],
            }),
          ],
        }),
        new TableCell({
          borders: CELL_BORDERS,
          shading: { type: ShadingType.CLEAR, fill: "EFF6FF", color: "auto" },
          margins: { top: 120, bottom: 120, left: 100, right: 100 },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: formatMoney(grandTotal, input.currency), bold: true, size: 24 }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: colWidths,
    rows,
  });
}

async function generateDocx(input: RenderQuoteInput): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

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
      spacing: { before: 200, after: 160 },
      children: [new TextRun({ text: "COTIZACIÓN", bold: true, size: 24 })],
    })
  );
  children.push(buildItemsTable(input));

  if (input.termsText?.length) {
    children.push(
      new Paragraph({
        spacing: { before: 300, after: 120 },
        children: [new TextRun({ text: "PLAZOS", bold: true, size: 22 })],
      })
    );
    children.push(...input.termsText.map((t) => new Paragraph({ spacing: { after: 100 }, children: [new TextRun(t)] })));
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
    children.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun("_________________________")] }));
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
