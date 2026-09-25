import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase environment variables are missing."
    );
  }

  return createClient(supabaseUrl, supabaseKey);
}

/*
|--------------------------------------------------------------------------
| GET PROJECT MESSAGE HISTORY
|--------------------------------------------------------------------------
|
| Returns the saved BABA conversation for one project.
|
| Example:
|
| GET /api/projects/DCL-00031/messages
|
*/

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    const supabase = getSupabase();

    /*
    |--------------------------------------------------------------------------
    | STEP 1: FIND PROJECT
    |--------------------------------------------------------------------------
    |
    | The URL contains the human-readable project number:
    |
    | DCL-00031
    |
    | project_messages uses the project's UUID, so we first translate the
    | DCL project number into its actual Supabase project ID.
    |
    */

    const { data: project, error: projectError } =
      await supabase
        .from("projects")
        .select("id, project_number")
        .eq("project_number", projectId)
        .maybeSingle();

    if (projectError) {
      console.error(
        "MESSAGE PROJECT LOOKUP ERROR:",
        projectError
      );

      return NextResponse.json(
        {
          error: "Project could not be loaded.",
          details: projectError.message,
        },
        { status: 500 }
      );
    }

    if (!project) {
      return NextResponse.json(
        {
          error: `Project ${projectId} was not found.`,
        },
        { status: 404 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 2: LOAD MESSAGE HISTORY
    |--------------------------------------------------------------------------
    |
    | Oldest message first gives us the natural conversation order:
    |
    | USER
    | BABA
    | USER
    | BABA
    |
    */

    const { data: messages, error: messagesError } =
      await supabase
        .from("project_messages")
        .select("id, role, message, created_at")
        .eq("project_id", project.id)
        .order("created_at", {
          ascending: true,
        });

    if (messagesError) {
      console.error(
        "PROJECT MESSAGE LOAD ERROR:",
        messagesError
      );

      return NextResponse.json(
        {
          error:
            "Project conversation could not be loaded.",
          details: messagesError.message,
        },
        { status: 500 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | SUCCESS
    |--------------------------------------------------------------------------
    */

    return NextResponse.json({
      success: true,
      projectId: project.project_number,
      messages: messages || [],
    });
  } catch (error) {
    console.error(
      "PROJECT MESSAGES ROUTE ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Project conversation could not be loaded.",
      },
      { status: 500 }
    );
  }
}