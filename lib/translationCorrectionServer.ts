import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleSupabase, isServiceRoleConfigured } from "./supabase/admin";
import { correctionDatabaseMessage, correctionWarning, type CorrectionInput } from "./translationCorrection";

/* =========================================================
   Saving a correction to a translation
============================================================
   1. the correction is saved with the CORRECTOR'S OWN session. The database checks who may correct
      what, keeps the translation as it was, fills in who corrected it, and replaces the translation
      in the same step, so the two can never disagree
   2. the corrected words are checked against the ORIGINAL (lib/translationGuard.ts). If the correction
      broke a number, it is kept but the next reader sees a warning; that note is saved with the
      server's own key, the same as a first translation's. */

export type CorrectionOutcome = { ok: true; outcome: "corrected" | "flagged" } | { ok: false; message: string };

export async function saveCorrection(supabase: SupabaseClient, input: CorrectionInput): Promise<CorrectionOutcome> {
  const { error } = await supabase
    .from("translation_corrections")
    .insert({ message_id: input.message_id, new_text: input.new_text, kind: input.kind, note: input.note });
  if (error) {
    console.error("TRANSLATION CORRECTION ERROR:", error.code, error.message);
    return { ok: false, message: correctionDatabaseMessage(error) };
  }

  /* the corrector can read the message they just corrected */
  const { data: message } = await supabase.from("factory_messages").select("original_text").eq("id", input.message_id).maybeSingle();
  const warning = message ? correctionWarning(message.original_text, input.new_text) : null;
  if (!warning) return { ok: true, outcome: "corrected" };

  if (!isServiceRoleConfigured()) {
    console.error("TRANSLATION CORRECTION: the server key is not configured, so the warning was not saved.");
    return { ok: true, outcome: "corrected" };
  }
  const { error: noteError } = await getServiceRoleSupabase().from("factory_messages").update({ translation_note: warning }).eq("id", input.message_id);
  if (noteError) {
    console.error("TRANSLATION CORRECTION NOTE ERROR:", noteError.code, noteError.message);
    return { ok: true, outcome: "corrected" };
  }
  return { ok: true, outcome: "flagged" };
}
