/* =========================================================
   DYE CUT LAB — the email a customer gets when their project moves on
============================================================
   Two small pure pieces, covered by tests/stageEmail.test.ts:
     - shouldEmailStageChange: which changes are worth an email
     - buildStageEmail: the words, taken from the customer stage names and
       "what happens next" sentences the dashboard already uses, so the email and
       the page can never disagree
   Sending is in lib/brevo.ts; who it goes to is decided in
   lib/customerAlerts.ts. */

import { PROJECT_STATUSES } from "../app/admin/statuses.ts";
import { customerStatusLabel, nextStepFor } from "./projectJourney.ts";
import { oneLine } from "./projectAlert.ts";

/* The first two stages are the team shaping the brief with the customer, who
   already sees that in the chat. */
const QUIET_STAGES = ["lead", "development"];

function stageIndex(status: string | null | undefined) {
  return (PROJECT_STATUSES as readonly string[]).indexOf((status || "").toLowerCase());
}

/* Only a real step forward to a stage the customer cares about. A correction
   backwards (the team undoing a mistake) must never email anyone. A previous
   stage the system does not know counts as "before the start". */
export function shouldEmailStageChange(from: string | null | undefined, to: string | null | undefined) {
  const toIndex = stageIndex(to);
  if (toIndex < 0) return false;
  if (QUIET_STAGES.includes((to || "").toLowerCase())) return false;
  return toIndex > stageIndex(from);
}

export type StageEmailInput = {
  projectNumber: string;
  title?: string | null;
  toStatus: string;
  customerName?: string | null;
  projectUrl: string;
};

function firstName(name: string | null | undefined) {
  const word = oneLine(name, 80).split(" ")[0];
  return word || "";
}

export function buildStageEmail(input: StageEmailInput) {
  const stage = customerStatusLabel(input.toStatus);
  const next = nextStepFor(input.toStatus);
  const name = firstName(input.customerName);

  return {
    subject: `Update on your project ${input.projectNumber}: ${stage}`,
    greeting: name ? `Hi ${name},` : "Hi,",
    stage,
    headline: next.headline,
    detail: next.detail,
    title: oneLine(input.title, 100),
    projectNumber: input.projectNumber,
    projectUrl: input.projectUrl,
    ctaLabel: "View your project",
  };
}
