/* =========================================================
   DYE CUT LAB — the factory's view of a project
============================================================
   Same blueprint stages as the customer journey (lib/projectJourney.ts), but
   phrased as "what is on you right now" for a partner factory. No server-only
   imports so pages and components can share it. */

export type FactoryNext = {
  headline: string;
  detail: string;
  /* action  = the factory has something to do
     waiting = DYE CUT LAB or the customer is working
     done    = finished */
  tone: "action" | "waiting" | "done";
  cta?: string;
};

const FACTORY_NEXT: Record<string, FactoryNext> = {
  lead: {
    headline: "Not ready yet",
    detail: "DYE CUT LAB is still gathering details from the customer.",
    tone: "waiting",
  },
  development: {
    headline: "Not ready yet",
    detail: "DYE CUT LAB is still shaping the brief with the customer.",
    tone: "waiting",
  },
  quote_ready: {
    headline: "With DYE CUT LAB",
    detail: "An estimate is with the customer. You'll be asked to review it if it moves forward.",
    tone: "waiting",
  },
  factory_review: {
    headline: "Review the brief",
    detail: "Check the specs, then confirm price and lead time with DYE CUT LAB.",
    tone: "action",
    cta: "Open brief",
  },
  approved: {
    headline: "Quote approved",
    detail: "Waiting for the customer's payment before production starts.",
    tone: "waiting",
  },
  payment: {
    headline: "Waiting for payment",
    detail: "Production starts once the customer has paid.",
    tone: "waiting",
  },
  proof: {
    headline: "Proof stage",
    detail: "Prepare the proof for the customer to approve.",
    tone: "action",
    cta: "Open brief",
  },
  production: {
    headline: "In production",
    detail: "Keep DYE CUT LAB updated as it moves forward.",
    tone: "action",
    cta: "Open brief",
  },
  qc: {
    headline: "Quality check",
    detail: "Final checks and photos before it ships.",
    tone: "action",
    cta: "Open brief",
  },
  shipping: {
    headline: "Shipped",
    detail: "On its way. DYE CUT LAB is tracking delivery.",
    tone: "waiting",
  },
  delivered: {
    headline: "Delivered",
    detail: "Nothing more to do on this one.",
    tone: "done",
  },
};

const FALLBACK: FactoryNext = {
  headline: "In progress",
  detail: "Open the project to see the latest.",
  tone: "waiting",
};

export function factoryNextFor(status: string | null | undefined): FactoryNext {
  return FACTORY_NEXT[(status || "").toLowerCase()] ?? FALLBACK;
}

/* Brief fields shown to a factory, in reading order. Anything empty is hidden.
   Deliberately no customer name, email or phone: the factory gets the
   manufacturing brief, not the customer relationship. */
export const BRIEF_FIELDS: { key: string; label: string }[] = [
  { key: "product_type", label: "Product" },
  { key: "quantity", label: "Quantity" },
  { key: "units", label: "Units" },
  { key: "size", label: "Size" },
  { key: "box_dimensions", label: "Box dimensions" },
  { key: "pouch_size", label: "Pouch size" },
  { key: "closure", label: "Closure" },
  { key: "material", label: "Material" },
  { key: "finish", label: "Finish" },
  { key: "flavor_count", label: "Flavors" },
  { key: "flavor_split", label: "Flavor split" },
  { key: "use_type", label: "Use" },
  { key: "artwork_status", label: "Artwork" },
];

export const FILE_CATEGORY_LABELS: Record<string, string> = {
  artwork: "Artwork",
  reference: "Reference",
  production: "Production",
  sample: "Sample",
  other: "Other",
};

/* ---------------------------------------------------------------------------
   What a factory may change itself. Only the two steps that happen on the
   factory floor; everything else (quote approval, payment, proofs, delivery)
   stays with DYE CUT LAB so a factory can never skip a stage or mark a project
   paid. Used by the project page (to show the button) and re-checked by the
   server action. */

export const FACTORY_MOVES: Record<string, { to: string; button: string; note: string; ok: string }> = {
  production: {
    to: "qc",
    button: "Move to quality check",
    note: "Production is finished and you're checking it before it ships.",
    ok: "moved_qc",
  },
  qc: {
    to: "shipping",
    button: "Mark as shipped",
    note: "Quality check passed and the order has left your factory.",
    ok: "moved_shipping",
  },
};

export function factoryMoveFor(status: string | null | undefined) {
  return FACTORY_MOVES[(status || "").toLowerCase()] ?? null;
}

/* Copy for the ?ok= / ?error= codes on the factory pages. */
export const FACTORY_MESSAGES: Record<string, string> = {
  moved_qc: "Moved to quality check. DYE CUT LAB and the customer can see the update.",
  moved_shipping: "Marked as shipped. DYE CUT LAB and the customer can see the update.",
  stale: "This project's status changed in the meantime. Check it below and try again.",
  save_failed: "That didn't save. Please try again.",
  not_found: "We couldn't find that project.",
  invalid: "That link looks broken. Please open the project from your list.",
  rate_limited: "Too many changes in a minute. Wait a moment and try again.",
  no_service_key: "Status updates aren't switched on yet. Please tell DYE CUT LAB.",
};
