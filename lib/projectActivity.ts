/* =========================================================
   DYE CUT LAB — the project activity history in plain words
============================================================
   The history rows come from project_activity (see
   supabase/migrations/20261015000000_project_activity.sql). This turns a row
   into one short sentence for the Activity tab. Pure functions, covered by
   tests/projectActivity.test.ts. */

export type ActivityRow = {
  id: string;
  kind: string;
  from_status: string | null;
  to_status: string | null;
  actor_role: string | null;
  created_at: string;
};

/* Who did it, in words that mean something to a customer. Staff names are not
   shown, only the team, so a customer never sees internal account details. */
export function actorWords(role: string | null | undefined) {
  if (role === "customer") return "the customer";
  if (role === "dcl_staff" || role === "dcl_admin") return "the DYE CUT LAB team";
  if (role === "factory") return "the factory";
  return "DYE CUT LAB";
}

/* label: turns a stage code such as "quote_ready" into its display name. It is a
   parameter so the customer pages and the team pages can use different wording. */
export function describeActivity(row: ActivityRow, label: (status: string) => string) {
  const by = actorWords(row.actor_role);

  if (row.kind === "created") {
    return row.actor_role ? `Project created by ${by}` : "Project created";
  }

  if (row.kind === "status_change" && row.to_status) {
    const to = label(row.to_status);
    if (row.from_status) return `Moved from ${label(row.from_status)} to ${to} by ${by}`;
    return `Moved to ${to} by ${by}`;
  }

  return "Project updated";
}

/* "Oct 15, 2026" — the same format the dashboard uses. Bad dates give "". */
export function activityDate(iso: string) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  return new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* Keep what the API returns tidy: newest first, only known fields, a sane limit. */
export function cleanActivity(rows: unknown, limit = 100): ActivityRow[] {
  if (!Array.isArray(rows)) return [];

  const clean: ActivityRow[] = [];
  for (const item of rows) {
    const row = (item ?? {}) as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.created_at !== "string") continue;
    clean.push({
      id: row.id,
      kind: typeof row.kind === "string" ? row.kind : "",
      from_status: typeof row.from_status === "string" ? row.from_status : null,
      to_status: typeof row.to_status === "string" ? row.to_status : null,
      actor_role: typeof row.actor_role === "string" ? row.actor_role : null,
      created_at: row.created_at,
    });
  }

  clean.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return clean.slice(0, limit);
}
