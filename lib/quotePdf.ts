/* =========================================================
   DYE CUT LAB — the estimate as a downloadable PDF
============================================================
   Built from the CUSTOMER-SAFE half of a quote version only (lib/quoteVersions.ts):
   the total, the price per piece, the lead time, what is and is not included, and
   the estimate notice. It never holds a cost, a margin, a price table or a rule
   name, so the same file is safe to send to a customer whoever downloads it.

   Two steps, so the wording can be tested without opening a PDF:
   1. buildEstimateDocument()  turns a version into plain text blocks
   2. renderEstimatePdf()      draws those blocks with pdf-lib (already a dependency)

   It says "Estimate" everywhere, never "Quote", because it is an estimate until a
   factory confirms it. Pure of server-only imports; covered by tests/quotePdf.test.ts. */

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { CONTACT } from "./contact.ts";
import { describeCustomerVersion, type CustomerQuoteVersion } from "./quoteVersions.ts";

export type EstimateDocumentInput = {
  projectNumber: string;
  projectTitle: string | null;
  preparedFor?: string | null;
  version: CustomerQuoteVersion;
};

export type EstimateDocument = {
  title: string;
  heading: string;
  projectLine: string;
  preparedFor: string | null;
  dateLine: string;
  versionLabel: string;
  total: string;
  perPiece: string;
  quantity: string;
  rows: { label: string; value: string }[];
  stepsTitle: string;
  steps: string[];
  notice: string;
  footer: string[];
  fileName: string;
};

function dateText(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  return new Date(time).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/* A file name that is safe in a download header: letters, digits and dashes. */
export function estimateFileName(projectNumber: string, version: number): string {
  const project = projectNumber.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40) || "project";
  return `DYE-CUT-LAB-Estimate-${project}-v${Math.max(1, Math.trunc(version))}.pdf`;
}

export function buildEstimateDocument(input: EstimateDocumentInput): EstimateDocument {
  const card = describeCustomerVersion(input.version);
  const title = (input.projectTitle || "").trim();

  const rows: { label: string; value: string }[] = [];
  if (card.included) {
    const included = card.included.replace(/^Includes\s+/, "").replace(/\.$/, "");
    rows.push({ label: "Includes", value: `${included.charAt(0).toUpperCase()}${included.slice(1)}` });
  }
  if (card.lead) rows.push({ label: "Lead time", value: card.lead });
  if (card.notIncluded) rows.push({ label: "Shipping", value: "Added after the estimate" });
  rows.push({ label: "Currency", value: "US dollars" });

  return {
    title: `Estimate, ${card.version.toLowerCase()}`,
    heading: card.heading,
    projectLine: title ? `${input.projectNumber} · ${title}` : input.projectNumber,
    preparedFor: input.preparedFor && input.preparedFor.trim() ? input.preparedFor.trim() : null,
    dateLine: dateText(input.version.createdAt),
    versionLabel: card.version,
    total: card.total,
    perPiece: card.perPiece,
    quantity: card.quantity,
    rows,
    stepsTitle: "What happens next",
    steps: [
      `Reply to us by text or email to go ahead.`,
      "We check the price and timing with a factory.",
      "Once a factory confirms it, you get the final quote.",
    ],
    notice: card.notice,
    footer: [
      `Questions? Text ${CONTACT.phoneDisplay} or email ${CONTACT.email}.`,
      "This estimate is not an invoice and is not a final quote.",
    ],
    fileName: estimateFileName(input.projectNumber, input.version.version),
  };
}

/* The standard PDF fonts cover basic Latin only. Anything else (for example a
   project title in Chinese) becomes "?" instead of making the whole PDF fail. */
export function safeText(font: PDFFont, value: string): string {
  let out = "";
  for (const char of value.replace(/\s+/g, " ")) {
    try {
      font.encodeText(char);
      out += char;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const BLACK = rgb(0.04, 0.04, 0.04);
const GREY = rgb(0.38, 0.4, 0.34);
const RULE = rgb(0.87, 0.89, 0.82);
const LIME = rgb(0.76, 0.95, 0.23);
const SOFT = rgb(0.95, 0.98, 0.87);
const WHITE = rgb(1, 1, 1);

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;

/* `logo` is the DYE CUT LAB logo as PNG bytes. It is optional so this stays pure:
   without it the header shows the name in text. */
export async function renderEstimatePdf(document: EstimateDocument, logo?: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(document.title);
  pdf.setAuthor("DYE CUT LAB");
  pdf.setSubject(document.projectLine);

  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const width = PAGE_W - MARGIN * 2;

  /* ---------- header bar ---------- */
  const headerH = 96;
  page.drawRectangle({ x: 0, y: PAGE_H - headerH, width: PAGE_W, height: headerH, color: LIME });

  let drewLogo = false;
  if (logo && logo.length > 0) {
    try {
      const image = await pdf.embedPng(logo);
      const height = 50;
      const scaled = (image.width / image.height) * height;
      page.drawImage(image, { x: MARGIN, y: PAGE_H - headerH / 2 - height / 2, width: scaled, height });
      drewLogo = true;
    } catch {
      drewLogo = false;
    }
  }
  if (!drewLogo) {
    page.drawText("DYE CUT LAB", { x: MARGIN, y: PAGE_H - 56, size: 24, font: bold, color: BLACK });
  }

  const tag = "ESTIMATE";
  const tagW = bold.widthOfTextAtSize(tag, 11);
  page.drawText(tag, { x: PAGE_W - MARGIN - tagW, y: PAGE_H - 44, size: 11, font: bold, color: BLACK });
  const meta = safeText(regular, [document.versionLabel, document.dateLine].filter(Boolean).join(" · "));
  const metaW = regular.widthOfTextAtSize(meta, 10);
  page.drawText(meta, { x: PAGE_W - MARGIN - metaW, y: PAGE_H - 60, size: 10, font: regular, color: BLACK });

  let y = PAGE_H - headerH - 44;

  /* ---------- title ---------- */
  page.drawText(safeText(bold, document.heading), { x: MARGIN, y, size: 30, font: bold, color: BLACK });
  y -= 26;
  for (const line of wrap(regular, safeText(regular, document.projectLine), 13, width)) {
    page.drawText(line, { x: MARGIN, y, size: 13, font: bold, color: BLACK });
    y -= 17;
  }
  if (document.preparedFor) {
    page.drawText(safeText(regular, `Prepared for ${document.preparedFor}`), { x: MARGIN, y, size: 12, font: regular, color: GREY });
    y -= 17;
  }
  y -= 18;

  /* ---------- the price card ---------- */
  const cardH = 112;
  page.drawRectangle({ x: MARGIN, y: y - cardH, width, height: cardH, color: BLACK });
  page.drawRectangle({ x: MARGIN, y: y - cardH, width: 8, height: cardH, color: LIME });

  page.drawText("ESTIMATED TOTAL", { x: MARGIN + 28, y: y - 30, size: 9, font: bold, color: LIME });
  page.drawText(safeText(bold, document.total), { x: MARGIN + 28, y: y - 74, size: 40, font: bold, color: WHITE });

  const rightX = MARGIN + width * 0.62;
  page.drawText("QUANTITY", { x: rightX, y: y - 30, size: 9, font: bold, color: LIME });
  page.drawText(safeText(bold, document.quantity), { x: rightX, y: y - 50, size: 15, font: bold, color: WHITE });
  page.drawText("PRICE", { x: rightX, y: y - 72, size: 9, font: bold, color: LIME });
  page.drawText(safeText(bold, document.perPiece), { x: rightX, y: y - 92, size: 15, font: bold, color: WHITE });
  y -= cardH + 34;

  /* ---------- what it covers ---------- */
  page.drawText("WHAT THIS ESTIMATE COVERS", { x: MARGIN, y, size: 9, font: bold, color: GREY });
  y -= 10;
  const labelW = 96;
  for (const row of document.rows) {
    const lines = wrap(regular, safeText(regular, row.value), 12, width - labelW);
    const rowH = lines.length * 16 + 14;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + width, y }, thickness: 0.8, color: RULE });
    page.drawText(safeText(bold, row.label), { x: MARGIN, y: y - 20, size: 11, font: bold, color: BLACK });
    lines.forEach((line, index) => {
      page.drawText(line, { x: MARGIN + labelW, y: y - 20 - index * 16, size: 12, font: regular, color: BLACK });
    });
    y -= rowH;
  }
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + width, y }, thickness: 0.8, color: RULE });
  y -= 34;

  /* ---------- what happens next ---------- */
  page.drawText(safeText(bold, document.stepsTitle.toUpperCase()), { x: MARGIN, y, size: 9, font: bold, color: GREY });
  y -= 22;
  document.steps.forEach((step, index) => {
    page.drawCircle({ x: MARGIN + 11, y: y + 4, size: 11, color: LIME });
    const n = String(index + 1);
    page.drawText(n, { x: MARGIN + 11 - bold.widthOfTextAtSize(n, 11) / 2, y: y, size: 11, font: bold, color: BLACK });
    const lines = wrap(regular, safeText(regular, step), 12, width - 40);
    lines.forEach((line, lineIndex) => {
      page.drawText(line, { x: MARGIN + 34, y: y - lineIndex * 16, size: 12, font: regular, color: BLACK });
    });
    y -= Math.max(30, lines.length * 16 + 14);
  });
  y -= 14;

  /* ---------- the estimate notice, always ---------- */
  const noticeLines = wrap(bold, safeText(bold, document.notice), 12, width - 48);
  const noticeH = noticeLines.length * 17 + 22;
  page.drawRectangle({ x: MARGIN, y: y - noticeH, width, height: noticeH, color: SOFT });
  page.drawRectangle({ x: MARGIN, y: y - noticeH, width: 6, height: noticeH, color: LIME });
  noticeLines.forEach((line, index) => {
    page.drawText(line, { x: MARGIN + 24, y: y - 24 - index * 17, size: 12, font: bold, color: BLACK });
  });

  /* ---------- footer ---------- */
  page.drawLine({ start: { x: MARGIN, y: 88 }, end: { x: MARGIN + width, y: 88 }, thickness: 0.8, color: RULE });
  let footerY = 70;
  for (const line of document.footer) {
    page.drawText(safeText(regular, line), { x: MARGIN, y: footerY, size: 9, font: regular, color: GREY });
    footerY -= 13;
  }
  const site = "dyecutlab.com";
  page.drawText(site, { x: PAGE_W - MARGIN - bold.widthOfTextAtSize(site, 10), y: 70, size: 10, font: bold, color: BLACK });

  return pdf.save();
}
