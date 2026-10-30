import { NextRequest, NextResponse } from "next/server";
import { forbidden, getRouteSupabase, unauthorized } from "../../../../../lib/supabase/route";
import { ESTIMATES_IN_APP } from "../../../../../lib/siteFlags";
import { latestCustomerVersion } from "../../../../../lib/quoteVersions";

/*
|--------------------------------------------------------------------------
| GET THE CUSTOMER'S ESTIMATE FOR ONE PROJECT
|--------------------------------------------------------------------------
|
| GET /api/projects/DCL-00031/estimate
|
| Returns the newest estimate the team has chosen to show, in its customer-safe
| form only (total, price per piece, lead time, what is and is not included, and
| the estimate notice). Never costs, margins or price tables.
|
| Three locks, so nothing leaks before it is meant to:
|   1. the site switch ESTIMATES_IN_APP (lib/siteFlags.ts): while it is false
|      this answers "not enabled" and nothing else, whoever asks
|   2. the database: a customer can read only versions the team has shown, on
|      their own project (the quote_versions rules); factories read nothing
|   3. this route asks only for shown versions and only the customer-safe columns
|
*/

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    const { supabase, user, role } = await getRouteSupabase();
    if (!user) return unauthorized();
    if (role === "factory") return forbidden();

    if (!ESTIMATES_IN_APP) {
      return NextResponse.json({ success: true, enabled: false, estimate: null });
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, project_number")
      .eq("project_number", projectId)
      .maybeSingle();

    if (projectError) {
      console.error("ESTIMATE PROJECT LOOKUP ERROR:", projectError);
      return NextResponse.json({ error: "Project could not be loaded." }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json({ error: `Project ${projectId} was not found.` }, { status: 404 });
    }

    const { data: rows, error } = await supabase
      .from("quote_versions")
      .select("version, created_at, quantity, sell_total, sell_per_piece, lead_days, includes, excludes, notice")
      .eq("project_id", project.id)
      .eq("shown_to_customer", true)
      .order("version", { ascending: false })
      .limit(10);

    if (error) {
      console.error("ESTIMATE LOAD ERROR:", error);
      return NextResponse.json({ error: "The estimate could not be loaded." }, { status: 500 });
    }

    return NextResponse.json({ success: true, enabled: true, estimate: latestCustomerVersion(rows) });
  } catch (error) {
    console.error("PROJECT ESTIMATE ROUTE ERROR:", error);
    return NextResponse.json({ error: "The estimate could not be loaded." }, { status: 500 });
  }
}
