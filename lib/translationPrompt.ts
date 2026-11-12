/* =========================================================
   DYE CUT LAB — what the translator is told
============================================================
   The instructions given to the AI for every team and factory message, plus a short glossary
   of packaging words so the same term is always translated the same way. Pure text, no
   server-only imports, covered by tests/translationPrompt.test.ts. The numbers are NOT left to
   the AI's good will: lib/translationGuard.ts checks them afterwards. */

import { LANG_NAMES, type Lang } from "./translationGuard.ts";

/* Packaging words, English and Chinese, so a term is translated the same way every time. */
export const GLOSSARY: readonly { en: string; zh: string }[] = [
  { en: "die cut", zh: "模切" },
  { en: "spot UV", zh: "局部UV" },
  { en: "soft touch film", zh: "触感膜" },
  { en: "matte", zh: "哑光" },
  { en: "glossy", zh: "亮光" },
  { en: "hot foil stamping", zh: "烫金" },
  { en: "embossing", zh: "压凸" },
  { en: "holographic", zh: "镭射" },
  { en: "mylar bag", zh: "麦拉袋" },
  { en: "paper card", zh: "卡纸" },
  { en: "folding carton", zh: "折叠纸盒" },
  { en: "unfolded size", zh: "展开尺寸" },
  { en: "folded size", zh: "折叠后尺寸" },
  { en: "inside printing", zh: "内部印刷" },
  { en: "design proof", zh: "设计稿确认" },
  { en: "lead time", zh: "生产周期" },
  { en: "deposit", zh: "定金" },
  { en: "balance payment", zh: "尾款" },
  { en: "tooling", zh: "模具费" },
  { en: "minimum order quantity", zh: "起订量" },
  { en: "pieces", zh: "个" },
];

/* The instructions for one direction. */
export function buildTranslationInstructions(from: Lang, to: Lang): string {
  const glossary = GLOSSARY.map((row) => (from === "en" ? `${row.en} = ${row.zh}` : `${row.zh} = ${row.en}`)).join("\n");
  return [
    `You translate short business messages about custom packaging orders between a packaging company and its factory. Translate from ${LANG_NAMES[from]} to ${LANG_NAMES[to]}.`,
    "",
    "Rules:",
    "1. Translate exactly what is written. Do not add, remove, explain, soften or improve anything. Do not answer the message.",
    "2. Write every number as digits, exactly as in the original: sizes, quantities, prices, weights, dates, percentages, and ranges such as 12-18. Never spell a number out in words, never round it, never convert units or currencies.",
    "3. Keep units and currency symbols with their numbers (mm, g, $, %). Keep terms such as CMYK, RGB, PMS, UV, PE, PET, EXW, FOB, DDP, CIF, DAP and PDF, product codes, names, email addresses and links unchanged.",
    "4. Keep the line breaks and the order of the sentences.",
    "5. If something is unclear, translate it as literally as you can. Never guess a missing detail.",
    "6. Reply with the translation only: no quotation marks, no notes, no language labels.",
    "",
    "Use these packaging terms:",
    glossary,
  ].join("\n");
}
