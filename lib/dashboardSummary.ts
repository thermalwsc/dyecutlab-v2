/* =========================================================
   DYE CUT LAB — the at-a-glance numbers on the dashboards
============================================================
   Pure functions, covered by tests/dashboardSummary.test.ts. */

import { PROJECT_STATUSES } from "../app/admin/statuses.ts";

export type StageCount = { status: string; count: number };

/* How many projects sit at each stage, in stage order (Lead first, Delivered
   last). Stages with none are left out. A value the system does not know (an
   old project) is kept and listed after the known stages, so nothing vanishes
   from the total. A missing stage is counted as "development", the same way the
   rest of the site treats it. */
export function countByStage(statuses: Array<string | null | undefined>): StageCount[] {
  const counts = new Map<string, number>();
  for (const raw of statuses) {
    const status = (raw || "development").trim().toLowerCase() || "development";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  const known = (PROJECT_STATUSES as readonly string[])
    .filter((status) => counts.has(status))
    .map((status) => ({ status, count: counts.get(status) as number }));

  const unknown = [...counts.entries()]
    .filter(([status]) => !(PROJECT_STATUSES as readonly string[]).includes(status))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => ({ status, count }));

  return [...known, ...unknown];
}

/* A project created in the last two days gets a "New" tag on the team's lists. */
export const NEW_PROJECT_HOURS = 48;

export function isNewProject(createdAt: string | null | undefined, now: number = Date.now()) {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  const age = now - created;
  return age >= 0 && age <= NEW_PROJECT_HOURS * 60 * 60 * 1000;
}
