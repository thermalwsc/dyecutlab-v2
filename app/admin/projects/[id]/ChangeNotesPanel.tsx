import type { SupabaseClient } from "@supabase/supabase-js";
import { changeKindLabel } from "../../../../lib/factoryChange";
import { Panel, Pill, formatDate } from "../../ui";

type Note = {
  id: string;
  factory_id: string;
  kind: string;
  what_changed: string;
  reason: string;
  created_at: string;
};

/* What the factory changed on this project, and why: the knowledge base the blueprint
   asks for. Read-only here; a note can never be edited or deleted. */
export default async function ChangeNotesPanel({ projectId, supabase }: { projectId: string; supabase: SupabaseClient }) {
  const { data, error } = await supabase
    .from("factory_change_notes")
    .select("id, factory_id, kind, what_changed, reason, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) console.error("CHANGE NOTES LOAD ERROR:", error.message);
  const notes = (data ?? []) as Note[];

  const factoryIds = [...new Set(notes.map((n) => n.factory_id))];
  const { data: factoryData } = factoryIds.length
    ? await supabase.from("factories").select("id, name").in("id", factoryIds)
    : { data: [] as { id: string; name: string }[] };
  const names = Object.fromEntries((factoryData ?? []).map((f) => [f.id, f.name]));

  return (
    <Panel title="What the factory changed" intro="Each change the factory made, and why. Kept as history so DICI can learn from it later.">
      {notes.length === 0 ? (
        <p className="rounded-xl bg-zinc-50 px-4 py-5 text-[14px] text-zinc-600">No changes recorded yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200">
          {notes.map((note) => (
            <li key={note.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Pill>{changeKindLabel(note.kind)}</Pill>
                <span className="text-[13px] text-zinc-600">
                  {names[note.factory_id] ?? "Factory"} · {formatDate(note.created_at)}
                </span>
              </div>
              <p className="mt-1.5 text-[14px] font-bold leading-snug">{note.what_changed}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-zinc-700">Why: {note.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
