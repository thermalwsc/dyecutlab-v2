import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { ESTIMATE_NOTICE } from "../lib/estimate.ts";
import { buildEstimateDocument, estimateFileName, renderEstimatePdf, safeText } from "../lib/quotePdf.ts";
import { toCustomerVersion, type CustomerQuoteVersion } from "../lib/quoteVersions.ts";

/* Every number here is made up to prove the file is built right. None of it is a price. */

function version(over: Partial<Parameters<typeof toCustomerVersion>[0] & object> = {}): CustomerQuoteVersion {
  const view = toCustomerVersion({
    version: 2,
    created_at: "2026-10-30T10:00:00.000Z",
    quantity: 500,
    sell_total: "1192.31",
    sell_per_piece: "2.3846",
    lead_days: 23,
    includes: ["product", "finishes", "tooling"],
    excludes: ["freight"],
    notice: ESTIMATE_NOTICE,
    ...over,
  });
  assert.ok(view);
  return view;
}

test("the document says estimate, the project, the date and the three figures", () => {
  const doc = buildEstimateDocument({ projectNumber: "DCL-00031", projectTitle: "Gift boxes", preparedFor: "Alex Rivera", version: version() });

  assert.equal(doc.title, "Estimate, version 2");
  assert.equal(doc.heading, "Your estimate");
  assert.equal(doc.projectLine, "DCL-00031 · Gift boxes");
  assert.equal(doc.preparedFor, "Alex Rivera");
  assert.equal(doc.dateLine, "October 30, 2026");
  assert.equal(doc.versionLabel, "Version 2");
  assert.equal(doc.total, "$1,192.31");
  assert.equal(doc.perPiece, "$2.38 per piece");
  assert.equal(doc.quantity, "500 pieces");
});

test("it explains what is included, the lead time, and that shipping comes after", () => {
  const doc = buildEstimateDocument({ projectNumber: "DCL-00031", projectTitle: null, version: version() });
  assert.deepEqual(doc.rows, [
    { label: "Includes", value: "The product, your finishes and tooling" },
    { label: "Lead time", value: "About 23 days from approval" },
    { label: "Shipping", value: "Added after the estimate" },
    { label: "Currency", value: "US dollars" },
  ]);
});

test("it says what happens next, without promising more than we can keep", () => {
  const doc = buildEstimateDocument({ projectNumber: "DCL-00031", projectTitle: null, version: version() });
  assert.equal(doc.stepsTitle, "What happens next");
  assert.equal(doc.steps.length, 3);
  assert.match(doc.steps[1], /factory/);
  assert.match(doc.steps[2], /final quote/);
});

test("the estimate notice is always on the page, and the footer points to the team", () => {
  const doc = buildEstimateDocument({ projectNumber: "DCL-00031", projectTitle: "x", version: version({ notice: null }) });
  assert.equal(doc.notice, ESTIMATE_NOTICE);
  assert.match(doc.footer.join(" "), /not an invoice/);
  assert.match(doc.footer.join(" "), /\(646\) 445-0026/);
  assert.match(doc.footer.join(" "), /dyecutlab@gmail\.com/);
});

test("missing details are left out, not shown as blanks", () => {
  const doc = buildEstimateDocument({ projectNumber: "DCL-00031", projectTitle: "  ", preparedFor: "  ", version: version({ includes: [], excludes: [], lead_days: null }) });
  assert.equal(doc.projectLine, "DCL-00031");
  assert.equal(doc.preparedFor, null);
  assert.deepEqual(doc.rows, [{ label: "Currency", value: "US dollars" }]);
});

test("nothing private or internal can appear in the document", () => {
  const doc = buildEstimateDocument({ projectNumber: "DCL-00031", projectTitle: "Gift boxes", preparedFor: "Alex", version: version() });
  const text = JSON.stringify(doc).toLowerCase();
  for (const secret of ["margin", "cost", "tier", "rule", "inputs", "default", "_"]) {
    assert.ok(!text.includes(secret), `the PDF text must not mention ${secret}`);
  }
  assert.ok(!text.includes('"quote'), "it is an estimate, never called a quote");
});

test("the file name is safe and carries the project and version", () => {
  assert.equal(estimateFileName("DCL-00031", 2), "DYE-CUT-LAB-Estimate-DCL-00031-v2.pdf");
  assert.equal(estimateFileName('DCL-0003"1; rm -rf /', 3), "DYE-CUT-LAB-Estimate-DCL-00031rm-rf-v3.pdf");
  assert.equal(estimateFileName("../../etc", 1), "DYE-CUT-LAB-Estimate-etc-v1.pdf");
  assert.equal(estimateFileName("", 0), "DYE-CUT-LAB-Estimate-project-v1.pdf");
});

test("text the standard font cannot draw becomes a question mark instead of breaking the file", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  assert.equal(safeText(font, "Gift boxes"), "Gift boxes");
  assert.equal(safeText(font, "测试 box"), "?? box");
  assert.equal(safeText(font, "  too   many\nspaces "), " too many spaces ");
});

test("the PDF is a real, single-page file with the right properties", async () => {
  const doc = buildEstimateDocument({ projectNumber: "DCL-00031", projectTitle: "Gift boxes", preparedFor: "Alex Rivera", version: version() });
  const bytes = await renderEstimatePdf(doc);

  assert.equal(Buffer.from(bytes.slice(0, 5)).toString("latin1"), "%PDF-");
  assert.ok(bytes.length > 1500, `${bytes.length} bytes`);

  const loaded = await PDFDocument.load(bytes);
  assert.equal(loaded.getPageCount(), 1);
  assert.equal(loaded.getTitle(), "Estimate, version 2");
  assert.equal(loaded.getAuthor(), "DYE CUT LAB");
});

test("a very long title, a non-Latin title and an empty list of details still produce a PDF", async () => {
  const long = "A very long project title that goes on and on ".repeat(12);
  for (const title of [long, "测试盒子 Gift box", ""]) {
    const doc = buildEstimateDocument({ projectNumber: "DCL-00031", projectTitle: title, version: version({ includes: [], excludes: [], lead_days: null }) });
    const bytes = await renderEstimatePdf(doc);
    const loaded = await PDFDocument.load(bytes);
    assert.equal(loaded.getPageCount(), 1);
  }
});

test("the logo is drawn when given, and a broken logo falls back to the name instead of failing", async () => {
  const doc = buildEstimateDocument({ projectNumber: "DCL-00031", projectTitle: "Gift boxes", version: version() });
  const plain = await renderEstimatePdf(doc);

  const logo = new Uint8Array(await readFile("public/dcl-logo.png"));
  const withLogo = await renderEstimatePdf(doc, logo);
  assert.ok(withLogo.length > plain.length + 10_000, `${withLogo.length} vs ${plain.length}`);
  assert.equal((await PDFDocument.load(withLogo)).getPageCount(), 1);

  const broken = await renderEstimatePdf(doc, new Uint8Array([1, 2, 3, 4]));
  assert.equal((await PDFDocument.load(broken)).getPageCount(), 1);
});
