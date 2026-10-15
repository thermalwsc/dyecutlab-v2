import { NextRequest, NextResponse } from "next/server";
import { forbidden, getRouteSupabase, unauthorized } from "../../../../../lib/supabase/route";
import { cleanActivity } from "../../../../../lib/projectActivity";

/*
|--------------------------------------------------------------------------
| GET PROJECT ACTIVITY HISTORY
|--------------------------------------------------------------------------
|
| Returns the stage history of one project, newest first:
|
| GET /api/projects/DCL-00031/activity
|
| The reads go through the signed-in user's client, so the database rules decide
| what is visible (owner, DYE CUT LAB team). Rows are only ever written by
| database triggers; there is no way to add, edit or remove one from here.
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

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, project_number")
      .eq("project_number", projectId)
      .maybeSingle();

    if (projectError) {
      console.error("ACTIVITY PROJECT LOOKUP ERROR:", projectError);
      return NextResponse.json({ error: "Project could not be loaded." }, { status: 500 });
    }

    if (!project) {
      return NextResponse.json({ error: `Project ${projectId} was not found.` }, { status: 404 });
    }

    const { data: rows, error: activityError } = await supabase
      .from("project_activity")
      .select("id, kind, from_status, to_status, actor_role, created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (activityError) {
      console.error("PROJECT ACTIVITY LOAD ERROR:", activityError);
      return NextResponse.json({ error: "Project history could not be loaded." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      projectId: project.project_number,
      activity: cleanActivity(rows),
    });
  } catch (error) {
    console.error("PROJECT ACTIVITY ROUTE ERROR:", error);
    return NextResponse.json({ error: "Project history could not be loaded." }, { status: 500 });
  }
}
