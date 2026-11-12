import type { SupabaseClient } from "@supabase/supabase-js";
import { threadLabels } from "../../../../lib/factoryThread";
import { correctionKindLabel, correctionLabels } from "../../../../lib/translationCorrection";
import ThreadList, { type ThreadItem } from "../../../factory/ThreadList";
import { BTN, FIELD, Panel, Pill, formatDate } from "../../ui";
import { correctTeamTranslation } from "./correctionActions";
import { sendTeamMessage } from "./threadActions";

type CorrectionRow = {
  id: string;
  corrector_side: string;
  lang: string;
  old_text: string;
  new_text: string;
  kind: string;
  note: string | null;
  created_at: string;
};

/* The private thread with the project's factory. The team writes English; the factory reads Chinese,
   and its replies come back in English with the original one tap away. Customers never see it. */
export default async function ThreadPanel({ projectId, hasFactory, supabase }: { projectId: string; hasFactory: boolean; supabase: SupabaseClient }) {
  const labels = threadLabels("team");

  if (!hasFactory) {
    return (
      <Panel title={labels.heading}>
        <p id="thread" className="rounded-xl bg-zinc-50 px-4 py-5 text-[14px] text-zinc-600">
          Assign a factory to this project to message it.
        </p>
      </Panel>
    );
  }

  const { data, error } = await supabase
    .from("factory_messages")
    .select("id, sender_side, original_text, original_lang, translated_text, translated_lang, translation_status, translation_note, corrected_at, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) console.error("THREAD LOAD ERROR:", error.message);
  const messages = (data ?? []) as ThreadItem[];

  /* the log of corrections, newest first: what the translation was, what it became, why */
  const { data: correctionData, error: correctionError } = await supabase
    .from("translation_corrections")
    .select("id, corrector_side, lang, old_text, new_text, kind, note, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (correctionError) console.error("CORRECTIONS LOAD ERROR:", correctionError.message);
  const corrections = (correctionData ?? []) as CorrectionRow[];
  const words = correctionLabels("en");

  return (
    <Panel title={labels.heading} intro={labels.intro}>
      <div id="thread" />
      <ThreadList
        messages={messages}
        viewer="team"
        labels={labels}
        formatDate={formatDate}
        correction={{ action: correctTeamTranslation, hidden: { project_id: projectId }, labels: words, lang: "en" }}
      />

      {corrections.length > 0 && (
        <details className="mt-4 rounded-xl bg-zinc-50 px-4 py-3">
          <summary className="cursor-pointer text-[14px] font-bold">
            {words.historyHeading} ({corrections.length})
          </summary>
          <ul className="mt-3 divide-y divide-zinc-200">
            {corrections.map((c) => (
              <li key={c.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill>{correctionKindLabel(c.kind, "en")}</Pill>
                  <span className="text-[13px] text-zinc-600">
                    {c.corrector_side === "team" ? words.byTeam : words.byFactory} · {formatDate(c.created_at)}
                  </span>
                </div>
                {c.note && <p className="mt-1.5 text-[13px] text-zinc-700">{c.note}</p>}
                <p className="mt-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-zinc-500">{words.before}</p>
                <p lang={c.lang} className="whitespace-pre-wrap break-words text-[13px] text-zinc-700">
                  {c.old_text}
                </p>
                <p className="mt-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-zinc-500">{words.after}</p>
                <p lang={c.lang} className="whitespace-pre-wrap break-words text-[13px] font-semibold text-zinc-900">
                  {c.new_text}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}

      <form action={sendTeamMessage} className="mt-5 grid gap-3">
        <input type="hidden" name="project_id" value={projectId} />
        <textarea name="message" required rows={3} maxLength={4000} placeholder={labels.placeholder} className={FIELD} />
        <button type="submit" className={BTN}>
          {labels.send}
        </button>
      </form>
    </Panel>
  );
}
