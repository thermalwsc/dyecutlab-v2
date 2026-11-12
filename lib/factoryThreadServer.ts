import "server-only";

import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleSupabase, isServiceRoleConfigured } from "./supabase/admin";
import {
  failedUpdate,
  finishedUpdate,
  planTranslation,
  skippedUpdate,
  threadDatabaseMessage,
  type ParsedThreadMessage,
  type ThreadSide,
  type TranslationUpdate,
} from "./factoryThread";
import { buildTranslationInstructions } from "./translationPrompt";
import type { Lang } from "./translationGuard";

/* =========================================================
   Sending a message in the team and factory thread, and translating it
============================================================
   1. the message is saved with the SENDER'S OWN session, so the database's rules decide who may
      write where, and fill in the factory, the side, the writer and the time
   2. the AI translates it for the other side
   3. the translation is checked against the original (lib/translationGuard.ts) and saved with the
      server's own key. The sender's session cannot write translations, so a person can never put
      words in the other side's mouth.
   A translation that fails never loses the message: the original is already saved, and is what the
   reader sees until a translation exists. */

const MODEL = process.env.TRANSLATION_MODEL || "gpt-5.6-luna";
const TIMEOUT_MS = 25_000;

/* The AI call. Throws when there is no key or the AI does not answer. */
async function translateText(text: string, from: Lang, to: Lang): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing.");
  const openai = new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await openai.responses.create({
    model: MODEL,
    instructions: buildTranslationInstructions(from, to),
    input: text,
  });
  return response.output_text;
}

async function saveTranslation(messageId: string, update: TranslationUpdate): Promise<boolean> {
  if (!isServiceRoleConfigured()) {
    console.error("THREAD TRANSLATION: the server key is not configured, so the translation was not saved.");
    return false;
  }
  const { error } = await getServiceRoleSupabase().from("factory_messages").update(update).eq("id", messageId);
  if (error) {
    console.error("THREAD TRANSLATION SAVE ERROR:", error.code, error.message);
    return false;
  }
  return true;
}

export type SendOutcome =
  | { ok: true; outcome: "sent" | "flagged" | "untranslated" }
  | { ok: false; message: string };

export async function sendThreadMessage(
  supabase: SupabaseClient,
  projectId: string,
  sender: ThreadSide,
  parsed: Extract<ParsedThreadMessage, { ok: true }>
): Promise<SendOutcome> {
  const { text, lang } = parsed.value;

  const { data, error } = await supabase
    .from("factory_messages")
    .insert({ project_id: projectId, original_text: text, original_lang: lang })
    .select("id")
    .single();
  if (error || !data) {
    console.error("THREAD MESSAGE ERROR:", error?.code, error?.message);
    return { ok: false, message: threadDatabaseMessage(error) };
  }

  const plan = planTranslation(sender, text);
  if (plan.kind === "skip") {
    await saveTranslation(data.id, skippedUpdate());
    return { ok: true, outcome: "sent" };
  }

  let update: TranslationUpdate;
  try {
    update = finishedUpdate(text, await translateText(text, plan.from, plan.to), plan.to);
  } catch (e) {
    console.error("THREAD TRANSLATION ERROR:", e instanceof Error ? e.message : e);
    update = failedUpdate();
  }
  const saved = await saveTranslation(data.id, update);

  if (!saved || update.translation_status === "failed") return { ok: true, outcome: "untranslated" };
  return { ok: true, outcome: update.translation_note ? "flagged" : "sent" };
}
