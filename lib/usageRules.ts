/* =========================================================
   DYE CUT LAB — the numbers behind the AI and upload limits
============================================================
   Plain constants (no server code) so tests/usageRules.test.ts can check them
   against the cost budget. lib/usageLimits.ts applies them.

   How they were chosen (Oct 16, 2026), from the OpenAI usage page:
     - 36 requests over the first week cost $0.04, about $0.001 each
     - planned with three times that margin: about $0.003 per chat message
     - a vision call (image analysis) costs more, planned at about $0.01
     - the monthly spending cap is $25, so a whole day at the site-wide ceiling
       should stay near a tenth of it
   Raise a number when real use needs it; the test shows what it would cost. */

export type UsageKind = "chat" | "analyze" | "preflight" | "upload";

export type Rule = {
  /** Most uses in a one-minute window, per account. */
  perMinute: number;
  /** Most uses per UTC day, per account. */
  perDay: number;
  /** Most uses per UTC day across the whole site. */
  siteDay: number;
  /** Shown to the person when they hit the limit. */
  label: string;
};

export const USAGE_RULES: Record<UsageKind, Rule> = {
  /* Both chats count here. A project takes about 15 to 20 messages, so 80 a day
     covers several projects for one customer. */
  chat: { perMinute: 12, perDay: 80, siteDay: 300, label: "chat messages" },
  /* One vision call per image. */
  analyze: { perMinute: 5, perDay: 20, siteDay: 100, label: "file analyses" },
  /* Reads the PDF itself, no AI cost. */
  preflight: { perMinute: 8, perDay: 100, siteDay: 1000, label: "file checks" },
  /* Storage, not AI: files are up to 25 MB each. */
  upload: { perMinute: 10, perDay: 50, siteDay: 400, label: "uploads" },
};

/* What the planning above assumes one AI call costs, in US dollars. */
export const PLANNED_COST_PER_CALL = { chat: 0.003, analyze: 0.01 } as const;

/* The monthly spending cap set on the OpenAI account. */
export const MONTHLY_AI_CAP_USD = 25;
