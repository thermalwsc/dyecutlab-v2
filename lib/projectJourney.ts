/* =========================================================
   DYE CUT LAB — the customer's view of the project journey
============================================================
   projects.status holds the blueprint state machine (Lead → … → Delivered).
   Customers see it as five plain steps, and each state gets one sentence
   about what happens next. Shared by the dashboard (/account) and the
   project page so they can never disagree. No server-only imports. */

export const JOURNEY_STEPS: { label: string; statuses: string[] }[] = [
  { label: "Brief", statuses: ["lead", "development"] },
  { label: "Quote", statuses: ["quote_ready", "factory_review", "approved"] },
  { label: "Proof", statuses: ["payment", "proof"] },
  { label: "Production", statuses: ["production", "qc"] },
  { label: "Delivery", statuses: ["shipping", "delivered"] },
];

/* Index of the step a status belongs to. Unknown or legacy values count as the
   first step rather than breaking the page. */
export function journeyStepIndex(status: string | null | undefined): number {
  const value = (status || "development").toLowerCase();
  const index = JOURNEY_STEPS.findIndex((step) => step.statuses.includes(value));
  return index === -1 ? 0 : index;
}

export type NextStep = {
  headline: string;
  detail: string;
  /* action  = the customer has something to do
     waiting = DYE CUT LAB or the factory is working
     done    = finished */
  tone: "action" | "waiting" | "done";
  cta?: string;
};

const NEXT_STEPS: Record<string, NextStep> = {
  lead: {
    headline: "We got your idea",
    detail: "Our team is reviewing it and will text you if we need more details.",
    tone: "waiting",
  },
  development: {
    headline: "We're shaping your project",
    detail: "Add files or details on the project page to speed things up.",
    tone: "waiting",
  },
  quote_ready: {
    headline: "Your estimate is ready",
    detail: "Take a look and tell us if you'd like to go ahead. It's an estimate until a factory confirms it.",
    tone: "action",
    cta: "Review estimate",
  },
  factory_review: {
    headline: "A factory is checking your quote",
    detail: "We're confirming price and timing. We'll let you know as soon as it's verified.",
    tone: "waiting",
  },
  approved: {
    headline: "Quote approved",
    detail: "Next up is payment. We'll send you the details.",
    tone: "waiting",
  },
  payment: {
    headline: "Payment is next",
    detail: "We'll send you the payment details so we can start your proof.",
    tone: "waiting",
  },
  proof: {
    headline: "Your proof is ready",
    detail: "Check the design, then approve it or ask for changes.",
    tone: "action",
    cta: "Review proof",
  },
  production: {
    headline: "Your order is being made",
    detail: "The factory is producing it. We'll update you at each step.",
    tone: "waiting",
  },
  qc: {
    headline: "Final quality check",
    detail: "We're checking everything before it ships.",
    tone: "waiting",
  },
  shipping: {
    headline: "On its way",
    detail: "Your order has shipped. Track it on the project page.",
    tone: "waiting",
  },
  delivered: {
    headline: "Delivered",
    detail: "Need more? Start a similar project in a minute.",
    tone: "done",
  },
};

const FALLBACK: NextStep = {
  headline: "In progress",
  detail: "Open the project to see the latest.",
  tone: "waiting",
};

export function nextStepFor(status: string | null | undefined): NextStep {
  return NEXT_STEPS[(status || "").toLowerCase()] ?? FALLBACK;
}

/* ---------------------------------------------------------------------------
   Requests a customer sent from /start, before the team turns them into a
   project. quote_requests.status is new → contacted → quoted → won / lost;
   the customer sees it in plain words (never the team's internal notes). */

export const REQUEST_STEPS = ["Received", "Contacted", "Quote sent", "Confirmed"] as const;

const REQUEST_INFO: Record<string, { label: string; headline: string; detail: string; step: number }> = {
  new: {
    label: "Received",
    headline: "We got your request",
    detail: "Our team has it and will text you soon.",
    step: 0,
  },
  contacted: {
    label: "We've been in touch",
    headline: "We've reached out",
    detail: "Check your messages. We've texted you about your request.",
    step: 1,
  },
  quoted: {
    label: "Quote sent",
    headline: "Your quote is on its way",
    detail: "We've sent you pricing. Reply to us any time to go ahead.",
    step: 2,
  },
  won: {
    label: "Confirmed",
    headline: "You're all set",
    detail: "Thanks! We're setting up your project and it will show here.",
    step: 3,
  },
  lost: {
    label: "Closed",
    headline: "This request is closed",
    detail: "Start a new project any time and we'll pick it up.",
    step: -1,
  },
};

export function requestInfoFor(status: string | null | undefined) {
  return REQUEST_INFO[(status || "").toLowerCase()] ?? REQUEST_INFO.new;
}
