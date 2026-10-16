/* =========================================================
   DYE CUT LAB — the "here's what I picked up" card in the start-your-project chat
============================================================
   The page builds the summary as plain lines such as "PACKAGING · BOX" and
   "FLAVORS · 2 · 100 PCS EACH". This turns each line into a label and a value so
   it can be shown as tidy tiles. Customers now see "designs" for what the code
   calls flavors. Pure function, covered by tests/intakeSummary.test.ts. */

export type SummaryRow = { label: string; value: string };

const LABEL_WORDS: Record<string, string> = {
  FLAVORS: "DESIGNS",
  FLAVOR: "DESIGNS",
};

export function summaryRows(text: string): SummaryRow[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(" · ");
      if (parts.length < 2) return { label: "", value: line };
      const label = parts[0].trim().toUpperCase();
      return { label: LABEL_WORDS[label] ?? label, value: parts.slice(1).join(" · ").trim() };
    });
}
