/* =========================================================
   DYE CUT LAB — when each journey step was reached
   ===========================================================
   The project page shows the customer the date every step of the journey was
   reached. The dates come from project_activity (rows written by database
   triggers, never by the browser): the first row that lands on a step gives
   the date that step was reached.

   Rules:
   - a step is reached when a row moves the project into one of its statuses
   - a skipped step keeps no date; a later date is never copied backwards
   - a step that was reached before and then corrected keeps its first date
   - rows with a broken date, an unknown status or an unknown kind are ignored

   Pure functions, no server-only imports, covered by
   tests/stageDates.test.ts. */

import { JOURNEY_STEPS, journeyStepIndex } from "./projectJourney.ts";
import { activityDate, type ActivityRow } from "./projectActivity.ts";

const STEP_COUNT = JOURNEY_STEPS.length;

/* The step a status belongs to, or -1 when the status is not part of the
   journey at all (a legacy or made-up value). */
function knownStepIndex(status: string | null | undefined): number {
  const value = (status || "").trim().toLowerCase();
  if (!value) return -1;

  const found = JOURNEY_STEPS.findIndex((step) =>
    step.statuses.includes(value)
  );

  return found;
}

/* When each step was reached for the first time, oldest first. Steps that were
   never reached keep null. */
export function stageDates(rows: ActivityRow[]): (string | null)[] {
  const dates: (string | null)[] = new Array(STEP_COUNT).fill(null);
  const times: (number | null)[] = new Array(STEP_COUNT).fill(null);

  if (!Array.isArray(rows)) return dates;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;

    const kind = row.kind;

    let step = -1;

    if (kind === "created") {
      step = 0;
    } else if (kind === "status_change") {
      step = knownStepIndex(row.to_status);
    } else {
      continue;
    }

    if (step < 0 || step >= STEP_COUNT) continue;

    const time = Date.parse(row.created_at);
    if (Number.isNaN(time)) continue;

    /* the first time the project reached this step wins */
    if (times[step] === null || time < (times[step] as number)) {
      times[step] = time;
      dates[step] = new Date(time).toISOString();
    }
  }

  return dates;
}

export type TrackerStep = {
  label: string;
  state: "done" | "now" | "upcoming";
  date: string;
};

/* The five steps with their state and their date, ready to show. The current
   step is "now"; steps before it are done; steps after it are still to come. */
export function trackerSteps(
  status: string | null | undefined,
  rows: ActivityRow[]
): TrackerStep[] {
  const current = journeyStepIndex(status);
  const dates = stageDates(rows);

  return JOURNEY_STEPS.map((step, index) => {
    const state: TrackerStep["state"] =
      index < current
        ? "done"
        : index === current
        ? "now"
        : "upcoming";

    const iso = dates[index];

    return {
      label: step.label,
      state,
      date:
        state === "upcoming" || !iso
          ? ""
          : activityDate(iso),
    };
  });
}
