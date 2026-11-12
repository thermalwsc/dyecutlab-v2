import { viewMessage, type ThreadLabels, type ThreadMessageRow, type ThreadSide } from "../../lib/factoryThread";
import { CORRECTION_KINDS, canCorrect, correctionKindLabel, type CorrectionLabels } from "../../lib/translationCorrection";
import type { Lang } from "../../lib/translationGuard";

export type ThreadItem = ThreadMessageRow & {
  id: string;
  sender_side: string;
  created_at: string;
};

/* What a reader needs to correct the translation they read: the action to post to, the hidden fields it
   needs (the project), the words, and the language the kinds of mistake are written in. */
export type CorrectionSetup = {
  action: (formData: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
  labels: CorrectionLabels;
  lang: Lang;
};

/* The messages of a thread, oldest first, in the language of the person reading. A translated
   message always has "view original" under it, so anyone can check the words (no script needed). */
export default function ThreadList({
  messages,
  viewer,
  labels,
  formatDate,
  correction,
}: {
  messages: ThreadItem[];
  viewer: ThreadSide;
  labels: ThreadLabels;
  formatDate: (iso: string) => string;
  correction?: CorrectionSetup;
}) {
  if (messages.length === 0) {
    return <p className="mt-4 rounded-xl bg-zinc-50 px-4 py-5 text-[14px] text-zinc-600">{labels.empty}</p>;
  }

  return (
    <ul className="mt-4 grid gap-3">
      {messages.map((message) => {
        const mine = message.sender_side === viewer;
        const view = viewMessage(message, viewer);
        return (
          <li key={message.id} className={`max-w-[92%] rounded-2xl p-4 ${mine ? "ml-auto bg-[var(--dcl-lime-soft)]" : "bg-zinc-50"}`}>
            <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-zinc-500">
              {mine ? labels.you : labels.other} · {formatDate(message.created_at)}
            </p>
            <p lang={view.original ? (viewer === "team" ? "en" : "zh") : undefined} className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-zinc-900">
              {view.text}
            </p>

            {view.state === "translated" && <p className="mt-1.5 text-[12px] font-medium text-zinc-500">{labels.translatedAuto}</p>}
            {view.state === "corrected" && <p className="mt-1.5 text-[12px] font-bold text-zinc-700">{correction?.labels.corrected ?? "Corrected"}</p>}
            {view.state === "flagged" && (
              <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-900">
                {labels.flagged}
                {viewer === "team" && view.note ? ` ${view.note}` : ""}
              </p>
            )}
            {view.state === "pending" && <p className="mt-1.5 text-[12px] font-medium text-zinc-500">{labels.pending}</p>}
            {view.state === "failed" && <p className="mt-1.5 text-[12px] font-semibold text-red-700">{labels.failed}</p>}

            {correction && canCorrect(viewer, message) && (view.state === "translated" || view.state === "corrected" || view.state === "flagged") && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[13px] font-bold underline underline-offset-2">{correction.labels.open}</summary>
                <form action={correction.action} className="mt-2 grid gap-2.5 rounded-lg bg-white p-3">
                  {Object.entries(correction.hidden).map(([name, value]) => (
                    <input key={name} type="hidden" name={name} value={value} />
                  ))}
                  <input type="hidden" name="message_id" value={message.id} />
                  <p className="text-[12px] leading-snug text-zinc-600">{correction.labels.hint}</p>
                  <textarea
                    name="new_text"
                    required
                    rows={4}
                    maxLength={12000}
                    defaultValue={view.text}
                    lang={viewer === "team" ? "en" : "zh"}
                    className="w-full rounded-lg border-2 border-zinc-300 bg-white px-3 py-2 text-[14px] leading-relaxed text-zinc-900 outline-none focus:border-black"
                  />
                  <label className="block text-[12px] font-bold uppercase tracking-[0.08em] text-zinc-600">
                    {correction.labels.kind}
                    <select
                      name="kind"
                      required
                      defaultValue=""
                      className="mt-1 h-11 w-full rounded-lg border-2 border-zinc-300 bg-white px-2 text-[14px] font-semibold normal-case tracking-normal text-zinc-900 outline-none focus:border-black"
                    >
                      <option value="" disabled>
                        {correction.labels.choose}
                      </option>
                      {CORRECTION_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {correctionKindLabel(kind, correction.lang)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[12px] font-bold uppercase tracking-[0.08em] text-zinc-600">
                    {correction.labels.note}
                    <input
                      name="note"
                      maxLength={1000}
                      className="mt-1 h-11 w-full rounded-lg border-2 border-zinc-300 bg-white px-3 text-[14px] font-medium normal-case tracking-normal text-zinc-900 outline-none focus:border-black"
                    />
                  </label>
                  <button type="submit" className="min-h-[44px] rounded-full border-[3px] border-black bg-white px-4 text-[14px] font-extrabold transition hover:bg-black hover:text-white">
                    {correction.labels.save}
                  </button>
                </form>
              </details>
            )}

            {view.theirs && (
              <details className="mt-2" open={Boolean(view.theirs.note)}>
                <summary className="cursor-pointer text-[13px] font-bold underline underline-offset-2">{labels.viewTheirs(view.theirs.lang)}</summary>
                {view.theirs.note && (
                  <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-900">
                    {labels.flagged}
                    {viewer === "team" ? ` ${view.theirs.note}` : ""}
                  </p>
                )}
                <p lang={view.theirs.lang} className="mt-1.5 whitespace-pre-wrap break-words rounded-lg bg-white px-3 py-2 text-[14px] leading-relaxed text-zinc-800">
                  {view.theirs.text}
                </p>
              </details>
            )}

            {view.original && view.originalLang && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[13px] font-bold underline underline-offset-2">{labels.viewOriginal(view.originalLang)}</summary>
                <p lang={view.originalLang} className="mt-1.5 whitespace-pre-wrap break-words rounded-lg bg-white px-3 py-2 text-[14px] leading-relaxed text-zinc-800">
                  {view.original}
                </p>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
