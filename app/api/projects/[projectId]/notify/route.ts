import { NextResponse } from "next/server";
import { sendStaffProjectEmail } from "../../../../../lib/brevo";
import { createRateLimiter } from "../../../../../lib/rateLimit";
import { sendStaffProjectSms } from "../../../../../lib/sendblue";
import { forbidden, getRouteSupabase, unauthorized } from "../../../../../lib/supabase/route";
import { getServiceRoleSupabase, isServiceRoleConfigured } from "../../../../../lib/supabase/admin";

/*
|--------------------------------------------------------------------------
| TELL THE TEAM ABOUT A NEW PROJECT FROM THE CHAT
|--------------------------------------------------------------------------
|
| POST /api/projects/DCL-00031/notify
|
| The start-your-project chat creates the project from the customer's browser,
| then calls this once. The server decides everything itself:
|
|   1. the caller is a signed-in customer
|   2. the project is theirs and was created in the last 30 minutes
|   3. "alerted" is CLAIMED in the database first
|      (update ... set team_alerted_at = now() where team_alerted_at is null),
|      so two calls can never send two alerts
|   4. the team is texted (Sendblue) and emailed (Brevo)
|
| A failed alert never affects the customer, and the response says nothing about
| which step happened. If the 20261015020000 migration has not been run, the
| claim fails, it is logged, and nothing is sent.
|
*/

const NUMBER_RE = /^[A-Za-z0-9-]{3,32}$/;
const FRESH_MS = 30 * 60 * 1000;
const isLimited = createRateLimiter({ windowMs: 60_000, maxRequests: 5 });

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    const { supabase, user, role } = await getRouteSupabase();
    if (!user) return unauthorized();
    if (role === "factory") return forbidden();

    if (isLimited(user.id)) {
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
    }

    if (!NUMBER_RE.test(projectId)) {
      return NextResponse.json({ error: "That project number doesn't look right." }, { status: 400 });
    }

    /* The team creates projects in the admin workspace, nothing to announce. */
    if (role !== "customer") return NextResponse.json({ ok: true });

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, project_number, title, request, units, quantity, flavor_count, owner_id, created_at")
      .eq("project_number", projectId)
      .maybeSingle();

    if (projectError) {
      console.error("NEW PROJECT ALERT LOOKUP ERROR:", projectError);
      return NextResponse.json({ error: "Something went wrong on our side." }, { status: 500 });
    }

    /* Same answer for "not yours" and "does not exist". */
    if (!project || project.owner_id !== user.id) {
      return NextResponse.json({ error: `Project ${projectId} was not found.` }, { status: 404 });
    }

    const age = Date.now() - Date.parse(project.created_at);
    if (Number.isNaN(age) || age > FRESH_MS) return NextResponse.json({ ok: true });

    if (!isServiceRoleConfigured()) {
      console.error("NEW PROJECT ALERT SKIPPED: service role key is not configured.");
      return NextResponse.json({ ok: true });
    }

    /* Claim first: only the call that gets a row back sends the alert. */
    const { data: claimed, error: claimError } = await getServiceRoleSupabase()
      .from("projects")
      .update({ team_alerted_at: new Date().toISOString() })
      .eq("id", project.id)
      .is("team_alerted_at", null)
      .select("id");

    if (claimError) {
      console.error("NEW PROJECT ALERT CLAIM ERROR (is migration 20261015020000 applied?):", claimError.message);
      return NextResponse.json({ ok: true });
    }
    if (!claimed?.length) return NextResponse.json({ ok: true });

    const [{ data: profile }, { data: clients }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      supabase.from("clients").select("phone").eq("owner_id", user.id).limit(1),
    ]);

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://dyecutlab.com").replace(/\/$/, "");
    const alert = {
      projectNumber: project.project_number as string,
      title: project.title as string | null,
      request: project.request as string | null,
      units: project.units as number | null,
      quantity: project.quantity as number | null,
      flavorCount: project.flavor_count as number | null,
      customerName: (profile?.full_name as string | null) ?? null,
      customerEmail: user.email ?? null,
      customerPhone: (clients?.[0]?.phone as string | null) ?? null,
      projectUrl: `${siteUrl}/admin/projects/${project.id}`,
    };

    const [sms, email] = await Promise.all([sendStaffProjectSms(alert), sendStaffProjectEmail(alert)]);

    /* The project is saved either way, but if neither alert went out nobody
       knows it is waiting, so make that loud in the logs. */
    if (sms.status !== "sent" && email.status !== "sent") {
      console.error("NEW PROJECT STAFF NOT NOTIFIED:", { project: alert.projectNumber, sms, email });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("NEW PROJECT ALERT ROUTE ERROR:", error);
    return NextResponse.json({ error: "Something went wrong on our side." }, { status: 500 });
  }
}
