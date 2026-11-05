"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../../../../lib/auth/guard";
import { notifyCustomerOfStageChange } from "../../../../lib/customerAlerts";
import { checkDecision, isFactoryQuoteStatus } from "../../../../lib/factoryQuote";
import { toEngineMargin, type MarginRow } from "../../../../lib/estimateProject";
import { createRateLimiter } from "../../../../lib/rateLimit";
import { saveQuoteVersionArgs } from "../../../../lib/quoteSave";
import { getServerSupabase } from "../../../../lib/supabase/server";
import { buildVerifiedQuoteArgs, type ApprovedFactoryQuote } from "../../../../lib/verifiedQuote";

/* =========================================================
   The team's decision on a factory quote
============================================================
   Every action:
     1. requireRole first: only the DYE CUT LAB team
     2. takes ids and a decision only. No price or total ever comes from the browser:
        the customer's price is worked out here from the factory's quote and our
        margin rules, after the quote itself has been read from the database
     3. writes with the signed-in team member's own session, so the database's
        rules (who may decide, final decisions, one approved quote per project)
        apply on top of these checks

   Approving a quote:
     a. the verified quote is worked out FIRST. If no margin rule fits, nothing
        changes and the team is told to add one
     b. the quote is marked approved (only if it is still waiting)
     c. the verified quote is saved as a new version of the project, hidden from the
        customer until the team shows it
     d. a project that is in "Factory review" moves to "Approved", and the customer is
        told the same way as for any other stage change
   If c fails after b, the quote stays approved and the panel offers a retry; the
   database allows only one verified quote per factory quote, so a retry can never
   create two. */

const TEAM = ["dcl_staff", "dcl_admin"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isWriteLimited = createRateLimiter({ windowMs: 60_000, maxRequests: 30 });

type Db = Awaited<ReturnType<typeof getServerSupabase>>;

function uuid(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return UUID_RE.test(s) ? s : null;
}

function back(projectId: string, params: Record<string, string>): never {
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/factory", "layout");
  redirect(`/admin/projects/${projectId}?${new URLSearchParams(params).toString()}`);
}

type ProjectRow = { id: string; product_type: string | null; status: string | null };
type QuoteRow = ApprovedFactoryQuote & { project_id: string; status: string };

async function loadProject(supabase: Db, projectId: string): Promise<ProjectRow | null> {
  const { data } = await supabase.from("projects").select("id, product_type, status").eq("id", projectId).maybeSingle();
  return (data as ProjectRow | null) ?? null;
}

async function loadQuote(supabase: Db, projectId: string, quoteId: string): Promise<QuoteRow | null> {
  const { data } = await supabase
    .from("factory_quotes")
    .select("id, project_id, status, quantity, price_per_piece, tooling_cost, lead_days")
    .eq("id", quoteId)
    .eq("project_id", projectId)
    .maybeSingle();
  return (data as QuoteRow | null) ?? null;
}

/* The verified quote, worked out from the factory quote and the margin rules. */
async function prepareVerified(supabase: Db, project: ProjectRow, quote: QuoteRow) {
  const { data, error } = await supabase
    .from("pricing_margins")
    .select("name, applies_to, margin, min_quantity, max_quantity, active")
    .eq("active", true);
  if (error) console.error("MARGINS LOAD ERROR:", error.message);
  const margins = ((data ?? []) as MarginRow[]).map(toEngineMargin);
  return buildVerifiedQuoteArgs(project.id, project.product_type ?? "", quote, margins);
}

/* Saves the verified quote and moves the project on. Safe to run twice. */
async function finishApproval(supabase: Db, project: ProjectRow, built: Extract<Awaited<ReturnType<typeof prepareVerified>>, { ok: true }>) {
  const saved = await saveQuoteVersionArgs(supabase, built.args);
  if (!saved.ok && saved.reason !== "duplicate") return { saved: false as const, version: null, moved: false };

  let moved = false;
  if (project.status === "factory_review") {
    const { data, error } = await supabase
      .from("projects")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", project.id)
      .eq("status", "factory_review")
      .select("id");
    if (error) console.error("PROJECT MOVE AFTER APPROVAL ERROR:", error.code, error.message);
    if (!error && data && data.length > 0) {
      moved = true;
      await notifyCustomerOfStageChange({ projectId: project.id, fromStatus: "factory_review", toStatus: "approved" });
    }
  }

  return { saved: true as const, version: saved.ok ? saved.version : null, moved };
}

export async function decideFactoryQuote(formData: FormData) {
  const projectId = uuid(formData.get("project_id"));
  if (!projectId) redirect("/admin/projects?error=invalid");

  const viewer = await requireRole(TEAM, { next: `/admin/projects/${projectId}` });
  if (isWriteLimited(viewer.user.id)) back(projectId, { error: "rate_limited" });

  const quoteId = uuid(formData.get("quote_id"));
  if (!quoteId) back(projectId, { error: "invalid" });

  const supabase = await getServerSupabase();
  const [project, quote] = await Promise.all([loadProject(supabase, projectId), loadQuote(supabase, projectId, quoteId)]);
  if (!project || !quote || !isFactoryQuoteStatus(quote.status)) back(projectId, { error: "not_found" });

  const decision = checkDecision(
    quote.status as "submitted" | "approved" | "rejected" | "superseded",
    String(formData.get("decision") ?? ""),
    typeof formData.get("note") === "string" ? (formData.get("note") as string) : null
  );
  if (!decision.ok) back(projectId, { error: "factory_quote_failed", why: decision.message });

  /* Approving: be sure the customer's price can be worked out before anything changes. */
  let built: Awaited<ReturnType<typeof prepareVerified>> | null = null;
  if (decision.status === "approved") {
    built = await prepareVerified(supabase, project, quote);
    if (!built.ok) back(projectId, { error: "factory_quote_failed", why: built.message });
  }

  const { data: updated, error } = await supabase
    .from("factory_quotes")
    .update({ status: decision.status, team_note: decision.note })
    .eq("id", quoteId)
    .eq("project_id", projectId)
    .eq("status", "submitted")
    .select("id");
  if (error) {
    console.error("FACTORY QUOTE DECISION ERROR:", error.code, error.message);
    const why =
      error.code === "23505"
        ? "This project already has an approved quote."
        : error.code === "23514"
          ? "That quote has already been decided or replaced."
          : "That did not save. Please try again.";
    back(projectId, { error: "factory_quote_failed", why });
  }
  if (!updated || updated.length === 0) {
    back(projectId, { error: "factory_quote_failed", why: "That quote was already decided or replaced in the meantime. Reload the page." });
  }

  if (decision.status === "rejected" || !built || !built.ok) back(projectId, { ok: "factory_quote_rejected" });

  const done = await finishApproval(supabase, project, built);
  if (!done.saved) back(projectId, { error: "factory_quote_unsaved" });
  back(projectId, { ok: "factory_quote_approved", version: done.version ? String(done.version) : "", moved: done.moved ? "1" : "0" });
}

/* The retry: an approved quote whose verified quote could not be saved. */
export async function saveVerifiedQuote(formData: FormData) {
  const projectId = uuid(formData.get("project_id"));
  if (!projectId) redirect("/admin/projects?error=invalid");

  const viewer = await requireRole(TEAM, { next: `/admin/projects/${projectId}` });
  if (isWriteLimited(viewer.user.id)) back(projectId, { error: "rate_limited" });

  const quoteId = uuid(formData.get("quote_id"));
  if (!quoteId) back(projectId, { error: "invalid" });

  const supabase = await getServerSupabase();
  const [project, quote] = await Promise.all([loadProject(supabase, projectId), loadQuote(supabase, projectId, quoteId)]);
  if (!project || !quote) back(projectId, { error: "not_found" });
  if (quote.status !== "approved") back(projectId, { error: "factory_quote_failed", why: "Only an approved quote can be turned into a verified quote." });

  const built = await prepareVerified(supabase, project, quote);
  if (!built.ok) back(projectId, { error: "factory_quote_failed", why: built.message });

  const done = await finishApproval(supabase, project, built);
  if (!done.saved) back(projectId, { error: "factory_quote_unsaved" });
  back(projectId, { ok: "factory_quote_approved", version: done.version ? String(done.version) : "", moved: done.moved ? "1" : "0" });
}
