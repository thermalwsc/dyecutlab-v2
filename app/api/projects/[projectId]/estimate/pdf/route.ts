import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { forbidden, getRouteSupabase, unauthorized } from "../../../../../../lib/supabase/route";
import { createRateLimiter } from "../../../../../../lib/rateLimit";
import { ESTIMATES_IN_APP } from "../../../../../../lib/siteFlags";
import { toCustomerVersion } from "../../../../../../lib/quoteVersions";
import { buildEstimateDocument, renderEstimatePdf } from "../../../../../../lib/quotePdf";

/*
|--------------------------------------------------------------------------
| DOWNLOAD AN ESTIMATE AS A PDF
|--------------------------------------------------------------------------
|
| GET /api/projects/DCL-00031/estimate/pdf            the newest version
| GET /api/projects/DCL-00031/estimate/pdf?version=2  one version
|
| The file holds the customer-safe half of a quote version only: no costs, no
| margins, no price tables. Who can download it:
|
|   - the DYE CUT LAB team: any version of any project, even one not yet shown,
|     so they can check it or send it by text while the site switch is off
|   - the customer who owns the project: only versions the team has shown, and
|     only once the site switch ESTIMATES_IN_APP is on
|   - factories and signed-out visitors: never
|
| The database's own rules (quote_versions) back this up: a customer's query can
| only ever return their own shown versions.
|
*/

const isRateLimited = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });

/* The logo for the header. If it cannot be read the PDF still works and shows
   the name in text. */
async function loadLogo(): Promise<Uint8Array | undefined> {
  try {
    return new Uint8Array(await readFile(path.join(process.cwd(), "public", "dcl-logo.png")));
  } catch {
    return undefined;
  }
}

const NOT_FOUND = () => NextResponse.json({ error: "That estimate was not found." }, { status: 404 });

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    const { supabase, user, role } = await getRouteSupabase();
    if (!user) return unauthorized();
    if (role === "factory") return forbidden();
    if (isRateLimited(user.id)) {
      return NextResponse.json({ error: "Too many downloads. Please wait a moment." }, { status: 429 });
    }

    const isTeam = role === "dcl_staff" || role === "dcl_admin";
    if (!isTeam && !ESTIMATES_IN_APP) return NOT_FOUND();

    if (!/^[A-Za-z0-9-]{1,40}$/.test(projectId)) return NOT_FOUND();

    const wanted = request.nextUrl.searchParams.get("version");
    const versionNumber = wanted === null ? null : Number(wanted);
    if (versionNumber !== null && (!Number.isInteger(versionNumber) || versionNumber <= 0)) return NOT_FOUND();

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, project_number, title, owner_id")
      .eq("project_number", projectId)
      .maybeSingle();

    if (projectError) {
      console.error("ESTIMATE PDF PROJECT ERROR:", projectError);
      return NextResponse.json({ error: "The estimate could not be prepared." }, { status: 500 });
    }
    if (!project) return NOT_FOUND();

    let query = supabase
      .from("quote_versions")
      .select("version, created_at, quantity, sell_total, sell_per_piece, lead_days, includes, excludes, notice")
      .eq("project_id", project.id);
    if (!isTeam) query = query.eq("shown_to_customer", true);
    if (versionNumber !== null) query = query.eq("version", versionNumber);

    const { data: rows, error } = await query.order("version", { ascending: false }).limit(1);
    if (error) {
      console.error("ESTIMATE PDF LOAD ERROR:", error);
      return NextResponse.json({ error: "The estimate could not be prepared." }, { status: 500 });
    }

    const version = toCustomerVersion(rows?.[0]);
    if (!version) return NOT_FOUND();

    let preparedFor: string | null = null;
    if (project.owner_id) {
      const { data: owner } = await supabase.from("profiles").select("full_name").eq("id", project.owner_id).maybeSingle();
      preparedFor = owner?.full_name ?? null;
    }

    const document = buildEstimateDocument({
      projectNumber: project.project_number,
      projectTitle: project.title,
      preparedFor,
      version,
    });
    const bytes = await renderEstimatePdf(document, await loadLogo());

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${document.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("ESTIMATE PDF ROUTE ERROR:", error);
    return NextResponse.json({ error: "The estimate could not be prepared." }, { status: 500 });
  }
}
