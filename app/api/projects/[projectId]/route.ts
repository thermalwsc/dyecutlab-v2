import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  return createClient(supabaseUrl, supabaseKey);
}

/*
|--------------------------------------------------------------------------
| GET PROJECT
|--------------------------------------------------------------------------
*/

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("project_number", projectId)
      .maybeSingle();

    if (error) {
      console.error("PROJECT GET ERROR:", error);

      return NextResponse.json(
        {
          error: "Project could not be loaded.",
          details: error.message,
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          error: `Project ${projectId} was not found.`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      project: data,
    });
  } catch (error) {
    console.error("PROJECT GET ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Project could not be loaded.",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PATCH PROJECT
|--------------------------------------------------------------------------
*/

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    const supabase = getSupabase();

    const body = await request.json();

    const allowedFields = [
      "pouch_size",
      "box_dimensions",
      "material",
      "finish",
      "closure",
      "artwork_status",
      "size",
    ] as const;

    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          error: "No valid project fields were provided.",
        },
        { status: 400 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | FIND PROJECT
    |--------------------------------------------------------------------------
    */

    const { data: existingProject, error: lookupError } = await supabase
      .from("projects")
      .select("id, project_number")
      .eq("project_number", projectId)
      .maybeSingle();

    if (lookupError) {
      console.error("PROJECT LOOKUP ERROR:", lookupError);

      return NextResponse.json(
        {
          error: "Project lookup failed.",
          details: lookupError.message,
        },
        { status: 500 }
      );
    }

    if (!existingProject) {
      return NextResponse.json(
        {
          error: `Project ${projectId} was not found.`,
        },
        { status: 404 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | UPDATE + RETURN UPDATED ROW
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    | .select().maybeSingle() lets us verify that Supabase
    | actually updated a row.
    |
    */

    const { data: updatedProject, error: updateError } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", existingProject.id)
      .select("*")
      .maybeSingle();

    if (updateError) {
      console.error("PROJECT UPDATE ERROR:", updateError);

      return NextResponse.json(
        {
          error: "Project could not be updated.",
          details: updateError.message,
        },
        { status: 500 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | ZERO ROWS UPDATED
    |--------------------------------------------------------------------------
    |
    | This usually means Supabase RLS/update permissions
    | blocked the UPDATE.
    |
    */

    if (!updatedProject) {
      console.error(
        "PROJECT UPDATE BLOCKED: No row returned after update.",
        {
          projectId,
          id: existingProject.id,
          updates,
        }
      );

      return NextResponse.json(
        {
          error: "Project exists, but Supabase did not update it.",
          details:
            "The UPDATE returned zero rows. Check Row Level Security and UPDATE policies on the projects table.",
        },
        { status: 403 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | SUCCESS
    |--------------------------------------------------------------------------
    */

    console.log("PROJECT UPDATED:", {
      projectId,
      updates,
    });

    return NextResponse.json({
      success: true,
      project: updatedProject,
    });
  } catch (error) {
    console.error("PROJECT PATCH ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Project could not be updated.",
      },
      { status: 500 }
    );
  }
}