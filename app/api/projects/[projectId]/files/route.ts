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
| FILE CATEGORIES
|--------------------------------------------------------------------------
*/

const allowedCategories = [
  "artwork",
  "reference",
  "production",
  "sample",
  "other",
] as const;

type FileCategory = (typeof allowedCategories)[number];

/*
|--------------------------------------------------------------------------
| SAFE FILE NAME
|--------------------------------------------------------------------------
|
| Removes characters that can cause trouble inside a storage path while
| preserving the original extension.
|
*/

function makeSafeFileName(fileName: string) {
  return fileName
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-+/g, "-");
}

/*
|--------------------------------------------------------------------------
| FIND PROJECT
|--------------------------------------------------------------------------
|
| The browser uses a human-readable project number such as DCL-00031.
| project_files uses the actual Supabase UUID.
|
*/

async function findProject(
  supabase: ReturnType<typeof getSupabase>,
  projectNumber: string
) {
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, project_number")
    .eq("project_number", projectNumber)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Project lookup failed: ${error.message}`
    );
  }

  return project;
}

/*
|--------------------------------------------------------------------------
| GET PROJECT FILES
|--------------------------------------------------------------------------
|
| Example:
|
| GET /api/projects/DCL-00031/files
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
    */

    const project = await findProject(
      supabase,
      projectId
    );

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
    | STEP 2: LOAD DATABASE FILE RECORDS
    |--------------------------------------------------------------------------
    */

    const { data: files, error: filesError } =
      await supabase
        .from("project_files")
        .select(
          `
            id,
            file_name,
            storage_path,
            file_type,
            file_size,
            category,
            uploaded_by,
            created_at
          `
        )
        .eq("project_id", project.id)
        .order("created_at", {
          ascending: false,
        });

    if (filesError) {
      console.error(
        "PROJECT FILE LOAD ERROR:",
        filesError
      );

      return NextResponse.json(
        {
          error: "Project files could not be loaded.",
          details: filesError.message,
        },
        { status: 500 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 3: LOAD EXISTING FILE INTELLIGENCE
    |--------------------------------------------------------------------------
    |
    | Completed analyses are returned with the file list so the workspace can
    | show saved File Intelligence immediately after a refresh.
    |
    */

    const { data: analyses, error: analysesError } =
      await supabase
        .from("project_file_analyses")
        .select(
          `
            id,
            file_id,
            status,
            width_px,
            height_px,
            format,
            visual_summary,
            visible_text,
            artwork_type,
            production_notes,
            possible_concerns,
            recommended_next_step,
            analyzed_at,
            error_message
          `
        )
        .eq("project_id", project.id);

    if (analysesError) {
      console.error(
        "PROJECT FILE ANALYSIS LOAD ERROR:",
        analysesError
      );

      return NextResponse.json(
        {
          error:
            "Project File Intelligence could not be loaded.",
          details: analysesError.message,
        },
        { status: 500 }
      );
    }

    const analysisByFileId = new Map(
      (analyses || []).map((analysis) => [
        analysis.file_id,
        analysis,
      ])
    );

    /*
    |--------------------------------------------------------------------------
    | STEP 4: LOAD EXISTING PDF PRODUCTION PREFLIGHTS
    |--------------------------------------------------------------------------
    |
    | Saved PDF preflight results are returned with the file list so the
    | workspace can restore Production Preflight immediately after refresh.
    |
    */

    const { data: preflights, error: preflightsError } =
      await supabase
        .from("project_file_preflights")
        .select(
          `
            id,
            file_id,
            version,
            status,
            page_count,
            consistent_page_size,
            pages,
            metadata,
            observations,
            concerns,
            not_verified,
            recommended_next_step,
            preflighted_at,
            error_message
          `
        )
        .eq("project_id", project.id);

    if (preflightsError) {
      console.error(
        "PROJECT FILE PREFLIGHT LOAD ERROR:",
        preflightsError
      );

      return NextResponse.json(
        {
          error:
            "Project Production Preflight could not be loaded.",
          details: preflightsError.message,
        },
        { status: 500 }
      );
    }

    const preflightByFileId = new Map(
      (preflights || []).map((preflight) => [
        preflight.file_id,
        preflight,
      ])
    );

    /*
    |--------------------------------------------------------------------------
    | STEP 5: CREATE TEMPORARY PRIVATE FILE URLS + ATTACH INTELLIGENCE
    |--------------------------------------------------------------------------
    |
    | The project-files bucket is private.
    |
    | Signed URLs expire after 1 hour. This lets the client preview/download
    | the file without making the bucket public.
    |
    */

    const filesWithUrls = await Promise.all(
      (files || []).map(async (file) => {
        const analysis =
          analysisByFileId.get(file.id) || null;

        const preflight =
          preflightByFileId.get(file.id) || null;

        const { data: signedData, error: signedError } =
          await supabase.storage
            .from("project-files")
            .createSignedUrl(
              file.storage_path,
              60 * 60
            );

        if (signedError) {
          console.error(
            "SIGNED URL ERROR:",
            signedError
          );

          return {
            ...file,
            url: null,
            analysis,
            preflight,
          };
        }

        return {
          ...file,
          url: signedData.signedUrl,
          analysis,
          preflight,
        };
      })
    );

    /*
    |--------------------------------------------------------------------------
    | SUCCESS
    |--------------------------------------------------------------------------
    */

    return NextResponse.json({
      success: true,
      projectId: project.project_number,
      files: filesWithUrls,
    });
  } catch (error) {
    console.error(
      "PROJECT FILE GET ROUTE ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Project files could not be loaded.",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST PROJECT FILE
|--------------------------------------------------------------------------
|
| Accepts multipart/form-data.
|
| Required:
| file
|
| Optional:
| category
|
| Example category:
| artwork
|
*/

export async function POST(
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
    */

    const project = await findProject(
      supabase,
      projectId
    );

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
    | STEP 2: READ FORM DATA
    |--------------------------------------------------------------------------
    */

    const formData = await request.formData();

    const fileValue = formData.get("file");
    const categoryValue = formData.get("category");

    if (!(fileValue instanceof File)) {
      return NextResponse.json(
        {
          error: "A file is required.",
        },
        { status: 400 }
      );
    }

    if (fileValue.size === 0) {
      return NextResponse.json(
        {
          error: "The selected file is empty.",
        },
        { status: 400 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 3: VALIDATE CATEGORY
    |--------------------------------------------------------------------------
    */

    let category: FileCategory = "reference";

    if (
      typeof categoryValue === "string" &&
      allowedCategories.includes(
        categoryValue as FileCategory
      )
    ) {
      category =
        categoryValue as FileCategory;
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 4: CREATE STORAGE PATH
    |--------------------------------------------------------------------------
    |
    | Example:
    |
    | DCL-00031/artwork/1724381122334-pouch-front.ai
    |
    */

    const safeFileName =
      makeSafeFileName(fileValue.name) ||
      "project-file";

    const uniqueFileName =
      `${Date.now()}-${crypto.randomUUID()}-${safeFileName}`;

    const storagePath =
      `${project.project_number}/${category}/${uniqueFileName}`;

    /*
    |--------------------------------------------------------------------------
    | STEP 5: CONVERT FILE FOR SUPABASE
    |--------------------------------------------------------------------------
    */

    const fileBuffer =
      await fileValue.arrayBuffer();

    /*
    |--------------------------------------------------------------------------
    | STEP 6: UPLOAD TO PRIVATE STORAGE
    |--------------------------------------------------------------------------
    */

    const { error: uploadError } =
      await supabase.storage
        .from("project-files")
        .upload(
          storagePath,
          fileBuffer,
          {
            contentType:
              fileValue.type ||
              "application/octet-stream",

            upsert: false,
          }
        );

    if (uploadError) {
      console.error(
        "PROJECT FILE STORAGE ERROR:",
        uploadError
      );

      return NextResponse.json(
        {
          error: "File could not be uploaded.",
          details: uploadError.message,
        },
        { status: 500 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 7: CREATE DATABASE RECORD
    |--------------------------------------------------------------------------
    */

    const { data: fileRecord, error: recordError } =
      await supabase
        .from("project_files")
        .insert({
          project_id: project.id,
          file_name: fileValue.name,
          storage_path: storagePath,
          file_type:
            fileValue.type || null,
          file_size: fileValue.size,
          category,
          uploaded_by: "client",
        })
        .select(
          `
            id,
            file_name,
            storage_path,
            file_type,
            file_size,
            category,
            uploaded_by,
            created_at
          `
        )
        .single();

    /*
    |--------------------------------------------------------------------------
    | DATABASE FAILURE CLEANUP
    |--------------------------------------------------------------------------
    |
    | If Storage succeeds but the database insert fails, remove the uploaded
    | object so we don't leave an orphan file sitting in the bucket.
    |
    */

    if (recordError) {
      console.error(
        "PROJECT FILE RECORD ERROR:",
        recordError
      );

      await supabase.storage
        .from("project-files")
        .remove([storagePath]);

      return NextResponse.json(
        {
          error:
            "File uploaded but its project record could not be created.",
          details: recordError.message,
        },
        { status: 500 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 8: CREATE PRIVATE SIGNED URL
    |--------------------------------------------------------------------------
    */

    const { data: signedData, error: signedError } =
      await supabase.storage
        .from("project-files")
        .createSignedUrl(
          storagePath,
          60 * 60
        );

    if (signedError) {
      console.error(
        "PROJECT FILE SIGNED URL ERROR:",
        signedError
      );
    }

    /*
    |--------------------------------------------------------------------------
    | SUCCESS
    |--------------------------------------------------------------------------
    */

    return NextResponse.json({
      success: true,

      file: {
        ...fileRecord,
        url:
          signedData?.signedUrl || null,
      },
    });
  } catch (error) {
    console.error(
      "PROJECT FILE POST ROUTE ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Project file could not be uploaded.",
      },
      { status: 500 }
    );
  }
}