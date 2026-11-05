import type { SupabaseClient } from "@supabase/supabase-js";
import { toEngineMargin, type MarginRow } from "../../../../lib/estimateProject";
import { factoryQuoteStatusLabel, isFactoryQuoteStatus } from "../../../../lib/factoryQuote";
import { percentText, usd } from "../../../../lib/pricingAdmin";
import { buildVerifiedQuoteArgs } from "../../../../lib/verifiedQuote";
import { BTN, BTN_GHOST, LABEL, Panel, Pill, TEXTAREA, formatDate } from "../../ui";
import { decideFactoryQuote, saveVerifiedQuote } from "./factoryQuoteActions";

type Project = { id: string; product_type: string | null };

type Quote = {
  id: string;
  factory_id: string;
  version: number;
  status: string;
  quantity: number;
  price_per_piece: number | string;
  tooling_cost: number | string;
  total: number | string;
  lead_days: number | null;
  notes: string | null;
  team_note: string | null;
  created_at: string;
};

/* The team's review of the quotes factories sent for one project. A waiting quote shows
   what the customer's price would be if it is approved, so nothing is a surprise. All
   writes go through factoryQuoteActions.ts. */
export default async function FactoryQuotePanel({ project, supabase }: { project: Project; supabase: SupabaseClient }) {
  const { data: quoteData, error } = await supabase
    .from("factory_quotes")
    .select("id, factory_id, version, status, quantity, price_per_piece, tooling_cost, total, lead_days, notes, team_note, created_at")
    .eq("project_id", project.id)
    .order("version", { ascending: false })
    .limit(30);
  if (error) console.error("FACTORY QUOTES LOAD ERROR:", error.message);
  const quotes = (quoteData ?? []) as Quote[];

  const factoryIds = [...new Set(quotes.map((q) => q.factory_id))];
  const { data: factoryData } = factoryIds.length
    ? await supabase.from("factories").select("id, name").in("id", factoryIds)
    : { data: [] as { id: string; name: string }[] };
  const factoryNames = Object.fromEntries((factoryData ?? []).map((f) => [f.id, f.name]));

  /* which approved quotes already have their verified quote, and under which version */
  const approvedIds = quotes.filter((q) => q.status === "approved").map((q) => q.id);
  const versionOf: Record<string, number> = {};
  if (approvedIds.length) {
    const { data: links } = await supabase.from("quote_version_details").select("version_id, factory_quote_id").in("factory_quote_id", approvedIds);
    const versionIds = (links ?? []).map((l) => l.version_id);
    const { data: versions } = versionIds.length
      ? await supabase.from("quote_versions").select("id, version").in("id", versionIds)
      : { data: [] as { id: string; version: number }[] };
    const numberById = Object.fromEntries((versions ?? []).map((v) => [v.id, v.version]));
    for (const link of links ?? []) {
      if (link.factory_quote_id && numberById[link.version_id]) versionOf[link.factory_quote_id] = numberById[link.version_id];
    }
  }

  const { data: marginData } = quotes.some((q) => q.status === "submitted")
    ? await supabase.from("pricing_margins").select("name, applies_to, margin, min_quantity, max_quantity, active").eq("active", true)
    : { data: [] as MarginRow[] };
  const margins = ((marginData ?? []) as MarginRow[]).map(toEngineMargin);

  return (
    <Panel
      title="Factory quotes"
      intro="What the factory quoted. Approving one works out the customer's price (the factory's price plus our margin) and saves it as a verified quote, hidden until you show it."
    >
      {quotes.length === 0 ? (
        <p className="rounded-xl bg-zinc-50 px-4 py-5 text-[14px] text-zinc-600">
          No factory quote yet. The factory sends one from its portal once a factory is assigned and the project is in Factory review.
        </p>
      ) : (
        <ul className="grid gap-4">
          {quotes.map((quote) => {
            const status = isFactoryQuoteStatus(quote.status) ? quote.status : null;
            const preview =
              quote.status === "submitted"
                ? buildVerifiedQuoteArgs(project.id, project.product_type ?? "", { ...quote, id: quote.id }, margins)
                : null;

            return (
              <li key={quote.id} className="rounded-2xl border-2 border-zinc-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] font-extrabold">
                      Version {quote.version} · {usd(quote.total)}
                    </p>
                    <p className="text-[13px] text-zinc-600">
                      {factoryNames[quote.factory_id] ?? "Factory"} · {Number(quote.quantity).toLocaleString("en-US")} pcs × {usd(quote.price_per_piece)}
                      {Number(quote.tooling_cost) > 0 ? ` + ${usd(quote.tooling_cost)} tooling` : ""}
                      {typeof quote.lead_days === "number" ? ` · ${quote.lead_days} days` : ""} · sent {formatDate(quote.created_at)}
                    </p>
                  </div>
                  <Pill>{status ? factoryQuoteStatusLabel(status, "team") : quote.status}</Pill>
                </div>

                {quote.notes && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-zinc-50 px-3 py-2 text-[13px] text-zinc-700">Factory note: {quote.notes}</p>}
                {quote.team_note && quote.status === "rejected" && (
                  <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-800">Your reason: {quote.team_note}</p>
                )}

                {quote.status === "submitted" && preview && (
                  <>
                    {preview.ok ? (
                      <p className="mt-3 rounded-xl bg-[var(--dcl-lime-soft)] px-3 py-2 text-[13px] font-semibold text-zinc-800">
                        If you approve it, the customer&apos;s price is <b>{usd(preview.sellTotal)}</b> ({usd(preview.sellPerPiece)} per piece), the factory&apos;s cost{" "}
                        {usd(preview.cost)} plus a {percentText(preview.margin)} margin. Shipping is added after.
                      </p>
                    ) : (
                      <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-900">
                        {preview.message}
                      </p>
                    )}

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:items-start">
                      <form action={decideFactoryQuote}>
                        <input type="hidden" name="project_id" value={project.id} />
                        <input type="hidden" name="quote_id" value={quote.id} />
                        <input type="hidden" name="decision" value="approved" />
                        <button type="submit" className={BTN} disabled={!preview.ok}>
                          Approve this quote
                        </button>
                      </form>

                      <form action={decideFactoryQuote} className="grid gap-2">
                        <input type="hidden" name="project_id" value={project.id} />
                        <input type="hidden" name="quote_id" value={quote.id} />
                        <input type="hidden" name="decision" value="rejected" />
                        <label className={LABEL}>
                          Reason, if you do not accept it
                          <textarea name="note" rows={2} maxLength={2000} className={TEXTAREA} placeholder="For example: the price is too high for this quantity." />
                        </label>
                        <button type="submit" className={BTN_GHOST}>
                          Reject
                        </button>
                      </form>
                    </div>
                  </>
                )}

                {quote.status === "approved" &&
                  (versionOf[quote.id] ? (
                    <p className="mt-3 text-[13px] font-semibold text-zinc-800">
                      Verified quote saved as version {versionOf[quote.id]}. Show it to the customer from the Estimate panel above.
                    </p>
                  ) : (
                    <form action={saveVerifiedQuote} className="mt-3 flex flex-wrap items-center gap-3">
                      <input type="hidden" name="project_id" value={project.id} />
                      <input type="hidden" name="quote_id" value={quote.id} />
                      <p className="text-[13px] font-semibold text-amber-900">Approved, but the verified quote is not saved yet.</p>
                      <button type="submit" className={BTN_GHOST}>
                        Save the verified quote
                      </button>
                    </form>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
