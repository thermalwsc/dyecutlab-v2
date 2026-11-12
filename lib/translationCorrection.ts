/* =========================================================
   DYE CUT LAB — correcting a translation: who may, what may be typed, the wording
============================================================
   The table is supabase/migrations/20261113000000_translation_corrections.sql, and the database checks
   the same things again. You correct the translation YOU read, never the translation of your own
   message. A correction replaces the translation and is kept forever (what it was, what it became,
   what kind of mistake, a note) so the translator's glossary and instructions can be improved from it.
   Pure functions, no server-only imports, covered by tests/translationCorrection.test.ts. */

import { checkTranslation, describeGuardProblems, type Lang } from "./translationGuard.ts";
import type { ThreadSide } from "./factoryThread.ts";

export const CORRECTION_KINDS = ["number", "term", "wording", "missing", "other"] as const;
export type CorrectionKind = (typeof CORRECTION_KINDS)[number];

export function isCorrectionKind(value: unknown): value is CorrectionKind {
  return typeof value === "string" && (CORRECTION_KINDS as readonly string[]).includes(value);
}

const KIND_LABELS: Record<Lang, Record<CorrectionKind, string>> = {
  en: {
    number: "A number is wrong",
    term: "A packaging term is wrong",
    wording: "The wording is unclear or wrong",
    missing: "Something is missing or was added",
    other: "Something else (say what)",
  },
  zh: {
    number: "数字有误",
    term: "专业术语有误",
    wording: "措辞不清或有误",
    missing: "有遗漏或多出内容",
    other: "其他（请说明）",
  },
};

export function correctionKindLabel(kind: string | null | undefined, lang: Lang): string {
  return isCorrectionKind(kind) ? KIND_LABELS[lang][kind] : String(kind ?? "");
}

export const CORRECTION_TEXT_MAX = 12000;
export const CORRECTION_NOTE_MAX = 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Who can correct which message: only the other side's, and only once it is translated. */
export function canCorrect(viewer: ThreadSide, message: { sender_side: string; translation_status: string; translated_text: string | null }): boolean {
  return message.sender_side !== viewer && message.translation_status === "done" && Boolean(message.translated_text);
}

export type CorrectionInput = { message_id: string; new_text: string; kind: CorrectionKind; note: string | null };
export type ParsedCorrection = { ok: true; value: CorrectionInput } | { ok: false; message: string };

/* Checks what was typed. `get` reads a value by field name (FormData.get works). */
export function parseCorrection(get: (name: string) => string | null | undefined): ParsedCorrection {
  const messageId = (get("message_id") ?? "").toString().trim();
  if (!UUID_RE.test(messageId)) return { ok: false, message: "That message could not be found." };

  const kind = (get("kind") ?? "").toString().trim();
  if (!isCorrectionKind(kind)) return { ok: false, message: "Choose what was wrong with the translation." };

  const text = (get("new_text") ?? "").toString().replace(/\r\n?/g, "\n").trim();
  if (!text) return { ok: false, message: "Write the corrected translation." };
  if (text.length > CORRECTION_TEXT_MAX) return { ok: false, message: `The corrected translation is too long (up to ${CORRECTION_TEXT_MAX.toLocaleString("en-US")} characters).` };

  const note = (get("note") ?? "").toString().replace(/\s+/g, " ").trim();
  if (note.length > CORRECTION_NOTE_MAX) return { ok: false, message: `The note is too long (up to ${CORRECTION_NOTE_MAX.toLocaleString("en-US")} characters).` };
  if (kind === "other" && !note) return { ok: false, message: 'Say what was wrong when you choose "Something else".' };

  return { ok: true, value: { message_id: messageId, new_text: text, kind, note: note || null } };
}

/* After a correction: the same number check as for the first translation, against the ORIGINAL. A
   correction that changes a number is kept, but the next reader sees a warning. Empty when fine. */
export function correctionWarning(original: string, corrected: string): string | null {
  return describeGuardProblems(checkTranslation(original, corrected)) || null;
}

/* A database refusal turned into one plain sentence, never the database's own words. */
export function correctionDatabaseMessage(error: { code?: string } | null | undefined): string {
  switch (error?.code) {
    case "42501":
      return "You can only correct a message on a project you can see.";
    case "23514":
      return "That correction was refused. Only a finished translation of the other side's message can be corrected, and it must change it.";
    default:
      return "That did not save. Please try again.";
  }
}

/* Words on the screen, in the language of the reader. */
export type CorrectionLabels = {
  open: string;
  hint: string;
  kind: string;
  choose: string;
  note: string;
  save: string;
  corrected: string;
  historyHeading: string;
  historyEmpty: string;
  before: string;
  after: string;
  byTeam: string;
  byFactory: string;
};

const EN: CorrectionLabels = {
  open: "Correct this translation",
  hint: "Fix the words so they are right. Your correction replaces this translation, and it is kept to make future translations better.",
  kind: "What was wrong",
  choose: "Choose…",
  note: "Note (optional)",
  save: "Save correction",
  corrected: "Corrected",
  historyHeading: "Translation corrections",
  historyEmpty: "No corrections yet.",
  before: "Before",
  after: "After",
  byTeam: "The team",
  byFactory: "The factory",
};

const ZH: CorrectionLabels = {
  open: "更正此翻译",
  hint: "请修改措辞使其准确。您的更正会替换当前翻译，并被保留下来，帮助改进今后的翻译。",
  kind: "问题出在哪里",
  choose: "请选择…",
  note: "备注（选填）",
  save: "保存更正",
  corrected: "已更正",
  historyHeading: "翻译更正记录",
  historyEmpty: "暂无更正。",
  before: "更正前",
  after: "更正后",
  byTeam: "DYE CUT LAB",
  byFactory: "工厂",
};

export function correctionLabels(lang: Lang): CorrectionLabels {
  return lang === "zh" ? ZH : EN;
}
