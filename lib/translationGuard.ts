/* =========================================================
   DYE CUT LAB — the translation guard: which way to translate, and proof nothing exact was lost
============================================================
   The team writes English, the factory reads Chinese, and the other way round. An AI does the
   translating, so every translation is CHECKED here before it is trusted: every number in the
   original (sizes, quantities, prices, weights, dates, percentages) must appear unchanged in
   the translation, nothing new may appear, and the technical codes that are never translated
   (CMYK, UV, EXW...) must survive. A translation that fails is kept but shown with a warning
   and the original beside it, never silently trusted.

   Pure functions, no server-only imports, covered by tests/translationGuard.test.ts. */

export type Lang = "en" | "zh";

export const LANGS: readonly Lang[] = ["en", "zh"];

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "zh";
}

const CJK = /[㐀-䶿一-鿿]/g;
const LATIN = /[A-Za-z]/g;

/* The language a message is written in, or null when there is nothing to translate (only
   numbers, symbols or emoji). A message that is mostly Chinese is Chinese; a few Chinese
   characters inside an English message (a name) do not change that. */
export function detectLanguage(text: string): Lang | null {
  const cjk = (text.match(CJK) ?? []).length;
  const latin = (text.match(LATIN) ?? []).length;
  const letters = cjk + latin;
  if (letters === 0) return null;
  return cjk / letters >= 0.3 ? "zh" : "en";
}

/* The one other language. Used so a message is always translated for the other side. */
export function otherLang(lang: Lang): Lang {
  return lang === "en" ? "zh" : "en";
}

export const LANG_NAMES: Record<Lang, string> = { en: "English", zh: "Chinese (Simplified)" };

/* From and to for a message, or null when it has no words to translate. */
export function translationDirection(text: string): { from: Lang; to: Lang } | null {
  const from = detectLanguage(text);
  return from ? { from, to: otherLang(from) } : null;
}

/* ---------------------------------------------------------------------------
   Protected numbers
   --------------------------------------------------------------------------- */

/* Full-width digits and marks (３０００，０．４６) are what a Chinese keyboard often types. */
function toHalfWidth(text: string): string {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/．/g, ".")
    .replace(/，/g, ",");
}

/* "1,500" and "1500" are the same number, "0.50" and ".5" and "0.5" too, "04" and "4" too. Kept
   as text, not turned into a float, so long numbers (a tracking number) stay exact. */
function canonical(token: string): string {
  let t = token.replace(/,/g, "");
  if (t.includes(".")) {
    t = t.replace(/0+$/, "").replace(/\.$/, "");
    if (t.startsWith(".")) t = "0" + t;
  }
  t = t.replace(/^0+(?=\d)/, "");
  return t === "" ? "0" : t;
}

const NUMBER = /\d+(?:,\d{3})*(?:\.\d+)?|\.\d+/g;

/* Every number in a text, in the form used to compare them. */
export function extractNumbers(text: string): string[] {
  return (toHalfWidth(text).match(NUMBER) ?? []).map(canonical);
}

function counts(values: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return map;
}

/* What is in `a` more times than in `b`. */
function surplus(a: string[], b: string[]): string[] {
  const inB = counts(b);
  const used = new Map<string, number>();
  const out: string[] = [];
  for (const value of a) {
    const seen = (used.get(value) ?? 0) + 1;
    used.set(value, seen);
    if (seen > (inB.get(value) ?? 0)) out.push(value);
  }
  return out;
}

/* ---------------------------------------------------------------------------
   Technical codes that are never translated
   --------------------------------------------------------------------------- */

export const KEEP_AS_IS = ["CMYK", "RGB", "PMS", "UV", "PE", "PET", "EXW", "FOB", "DDP", "CIF", "DAP", "PDF"] as const;

/* The codes in a text, as whole words (so "UV" is found in "spot UV" and "局部UV", not in "UVA"). */
export function extractCodes(text: string): string[] {
  const found: string[] = [];
  for (const code of KEEP_AS_IS) {
    if (new RegExp(`(?<![A-Za-z])${code}(?![A-Za-z])`).test(text)) found.push(code);
  }
  return found;
}

/* ---------------------------------------------------------------------------
   The check
   --------------------------------------------------------------------------- */

export type GuardResult = {
  ok: boolean;
  /* numbers in the original that are not in the translation (changed or dropped) */
  missingNumbers: string[];
  /* numbers in the translation that were never in the original (made up) */
  addedNumbers: string[];
  /* codes (CMYK, UV...) in the original that are not in the translation */
  missingCodes: string[];
};

export function checkTranslation(original: string, translated: string): GuardResult {
  const from = extractNumbers(original);
  const to = extractNumbers(translated);
  const missingNumbers = surplus(from, to);
  const addedNumbers = surplus(to, from);

  const kept = new Set(extractCodes(translated));
  const missingCodes = extractCodes(original).filter((code) => !kept.has(code));

  return {
    ok: missingNumbers.length === 0 && addedNumbers.length === 0 && missingCodes.length === 0,
    missingNumbers,
    addedNumbers,
    missingCodes,
  };
}

/* One plain sentence for the person reading, in English, naming what to check. Empty when fine. */
export function describeGuardProblems(result: GuardResult): string {
  if (result.ok) return "";
  const parts: string[] = [];
  if (result.missingNumbers.length) parts.push(`these numbers from the original are missing or changed: ${result.missingNumbers.join(", ")}`);
  if (result.addedNumbers.length) parts.push(`these numbers are not in the original: ${result.addedNumbers.join(", ")}`);
  if (result.missingCodes.length) parts.push(`these terms were not kept: ${result.missingCodes.join(", ")}`);
  return `Check this translation against the original: ${parts.join("; ")}.`;
}
