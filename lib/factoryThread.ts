/* =========================================================
   DYE CUT LAB — the team and factory thread: what may be sent, who needs a translation, what is shown
============================================================
   The thread is supabase/migrations/20261109000000_factory_messages.sql. The team reads English and
   the factory reads Chinese, so a message is translated for the OTHER side. The original is always
   kept and always one tap away. Pure functions, no server-only imports, covered by
   tests/factoryThread.test.ts. The AI call itself is in lib/factoryThreadServer.ts. */

import { checkTranslation, describeGuardProblems, detectLanguage, type Lang } from "./translationGuard.ts";
/* (the factory portal's own words are in lib/factoryI18n.ts) */

export type ThreadSide = "team" | "factory";
export type TranslationStatus = "pending" | "done" | "failed" | "skipped";

export const MESSAGE_MAX = 4000;
const TRANSLATION_MAX = 12000;

/* What each side reads. */
export function readerLang(side: ThreadSide): Lang {
  return side === "team" ? "en" : "zh";
}

/* A message is addressed to the other side, so it must be readable in THEIR language. */
export function recipientLang(sender: ThreadSide): Lang {
  return readerLang(sender === "team" ? "factory" : "team");
}

export type ParsedThreadMessage =
  | { ok: true; value: { text: string; lang: Lang } }
  | { ok: false; message: string };

/* Checks what was typed. `get` reads a value by field name (FormData.get works). The language is read
   from the words; a message with no words (only numbers) counts as the sender's own language. */
export function parseThreadMessage(get: (name: string) => string | null | undefined, sender: ThreadSide): ParsedThreadMessage {
  const text = (get("message") ?? "").toString().replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return { ok: false, message: "Write a message first." };
  if (text.length > MESSAGE_MAX) return { ok: false, message: `The message is too long (up to ${MESSAGE_MAX.toLocaleString("en-US")} characters).` };
  return { ok: true, value: { text, lang: detectLanguage(text) ?? readerLang(sender) } };
}

export type TranslationPlan = { kind: "skip" } | { kind: "translate"; from: Lang; to: Lang };

/* Nothing to translate when the message has no words, or is already in the reader's language. */
export function planTranslation(sender: ThreadSide, text: string): TranslationPlan {
  const from = detectLanguage(text);
  if (!from) return { kind: "skip" };
  const to = recipientLang(sender);
  return from === to ? { kind: "skip" } : { kind: "translate", from, to };
}

/* ---------------------------------------------------------------------------
   Saving the result of a translation
   --------------------------------------------------------------------------- */

export type TranslationUpdate = {
  translation_status: TranslationStatus;
  translated_text: string | null;
  translated_lang: Lang | null;
  translation_note: string | null;
  translated_at: string;
};

export const FAILED_NOTE = "The translation did not finish.";

export function skippedUpdate(now: Date = new Date()): TranslationUpdate {
  return { translation_status: "skipped", translated_text: null, translated_lang: null, translation_note: null, translated_at: now.toISOString() };
}

export function failedUpdate(now: Date = new Date()): TranslationUpdate {
  return { translation_status: "failed", translated_text: null, translated_lang: null, translation_note: FAILED_NOTE, translated_at: now.toISOString() };
}

/* A finished translation, checked against the original. A translation that changes a number or drops a
   technical code is still saved, but with a note saying what to check, so it is never trusted silently. */
export function finishedUpdate(original: string, translated: string | null | undefined, to: Lang, now: Date = new Date()): TranslationUpdate {
  const text = (translated ?? "").trim();
  if (!text || text.length > TRANSLATION_MAX) return failedUpdate(now);
  const note = describeGuardProblems(checkTranslation(original, text));
  return {
    translation_status: "done",
    translated_text: text,
    translated_lang: to,
    translation_note: note || null,
    translated_at: now.toISOString(),
  };
}

/* ---------------------------------------------------------------------------
   What a reader sees
   --------------------------------------------------------------------------- */

export type ThreadMessageRow = {
  original_text: string;
  original_lang: string;
  translated_text: string | null;
  translated_lang: string | null;
  translation_status: string;
  translation_note: string | null;
  /* set once a person has corrected the translation (supabase/migrations/20261113000000_translation_corrections.sql) */
  corrected_at?: string | null;
};

export type ThreadView = {
  /* the text to show first, in the reader's language when possible */
  text: string;
  /* the original, offered behind "view original", only when the main text is a translation */
  original: string | null;
  originalLang: Lang | null;
  state: "original" | "translated" | "corrected" | "flagged" | "pending" | "failed";
  /* what to check, for a flagged translation */
  note: string | null;
  /* for a message the reader wrote themselves: the translation the OTHER side reads, so the writer
     can see exactly what was sent (and any warning on it) */
  theirs: { text: string; lang: Lang; note: string | null; corrected: boolean } | null;
};

export function viewMessage(message: ThreadMessageRow, viewer: ThreadSide): ThreadView {
  const want = readerLang(viewer);
  const originalLang = message.original_lang === "zh" ? "zh" : "en";

  if (originalLang === want) {
    const theirLang: Lang = want === "en" ? "zh" : "en";
    const theirs =
      message.translation_status === "done" && message.translated_lang === theirLang && message.translated_text
        ? { text: message.translated_text, lang: theirLang, note: message.translation_note, corrected: Boolean(message.corrected_at) }
        : null;
    return { text: message.original_text, original: null, originalLang: null, state: "original", note: null, theirs };
  }

  if (message.translation_status === "done" && message.translated_lang === want && message.translated_text) {
    const flagged = Boolean(message.translation_note);
    return {
      text: message.translated_text,
      original: message.original_text,
      originalLang,
      state: flagged ? "flagged" : message.corrected_at ? "corrected" : "translated",
      note: flagged ? message.translation_note : null,
      theirs: null,
    };
  }
  if (message.translation_status === "pending") return { text: message.original_text, original: null, originalLang, state: "pending", note: null, theirs: null };
  if (message.translation_status === "failed") return { text: message.original_text, original: null, originalLang, state: "failed", note: message.translation_note, theirs: null };
  return { text: message.original_text, original: null, originalLang: null, state: "original", note: null, theirs: null };
}

/* ---------------------------------------------------------------------------
   Words on the screen, in the language of the person reading
   --------------------------------------------------------------------------- */

export type ThreadLabels = {
  heading: string;
  intro: string;
  placeholder: string;
  send: string;
  empty: string;
  viewOriginal: (lang: Lang) => string;
  /* under a message you wrote: what the other side reads */
  viewTheirs: (lang: Lang) => string;
  translatedAuto: string;
  pending: string;
  failed: string;
  flagged: string;
  you: string;
  other: string;
};

const EN: ThreadLabels = {
  heading: "Messages with the factory",
  intro: "Write in English. The factory reads it in Chinese, and its replies come back in English. Sizes, quantities and prices are checked so they never change in translation.",
  placeholder: "Write a message to the factory…",
  send: "Send message",
  empty: "No messages yet.",
  viewOriginal: (lang) => `View original (${lang === "zh" ? "Chinese" : "English"})`,
  viewTheirs: (lang) => `What the factory reads (${lang === "zh" ? "Chinese" : "English"})`,
  translatedAuto: "Translated automatically",
  pending: "Translation is not ready yet. The original is shown.",
  failed: "The translation did not finish, so the original is shown.",
  flagged: "Check this translation against the original.",
  you: "You",
  other: "Factory",
};

const ZH: ThreadLabels = {
  heading: "消息",
  intro: "与 DYE CUT LAB 沟通。您可以用中文书写，我们会自动翻译。尺寸、数量和价格会被核对，翻译时不会改变。",
  placeholder: "在此输入消息…",
  send: "发送",
  empty: "还没有消息。",
  viewOriginal: (lang) => `查看原文（${lang === "zh" ? "中文" : "英文"}）`,
  viewTheirs: (lang) => `DYE CUT LAB 看到的版本（${lang === "zh" ? "中文" : "英文"}）`,
  translatedAuto: "自动翻译",
  pending: "翻译尚未完成，现显示原文。",
  failed: "翻译未完成，现显示原文。",
  flagged: "请对照原文核对此翻译。",
  you: "您",
  other: "DYE CUT LAB",
};

/* A factory that chose the English portal still reads its thread, in English words. */
const FACTORY_EN: ThreadLabels = {
  heading: "Messages with DYE CUT LAB",
  intro: "Write in Chinese or English. DYE CUT LAB reads it in English, and replies come back in Chinese. Sizes, quantities and prices are checked so they never change in translation.",
  placeholder: "Write a message to DYE CUT LAB…",
  send: "Send message",
  empty: "No messages yet.",
  viewOriginal: (lang) => `View original (${lang === "zh" ? "Chinese" : "English"})`,
  viewTheirs: (lang) => `What DYE CUT LAB reads (${lang === "zh" ? "Chinese" : "English"})`,
  translatedAuto: "Translated automatically",
  pending: "Translation is not ready yet. The original is shown.",
  failed: "The translation did not finish, so the original is shown.",
  flagged: "Check this translation against the original.",
  you: "You",
  other: "DYE CUT LAB",
};

export function threadLabels(viewer: ThreadSide, lang?: Lang): ThreadLabels {
  if (viewer === "team") return EN;
  return lang === "en" ? FACTORY_EN : ZH;
}

/* A database refusal turned into one plain sentence, never the database's own words. */
export function threadDatabaseMessage(error: { code?: string } | null | undefined): string {
  switch (error?.code) {
    case "42501":
      return "You can only write in the thread of a project assigned to your factory.";
    case "23514":
      return "This project has no factory yet, or the message was refused. Check it and try again.";
    default:
      return "That did not send. Please try again.";
  }
}
