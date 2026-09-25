import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

/*
|--------------------------------------------------------------------------
| CLIENTS
|--------------------------------------------------------------------------
*/

function getSupabase() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase environment variables are missing."
    );
  }

  return createClient(
    supabaseUrl,
    supabaseKey
  );
}

function getOpenAI() {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is missing."
    );
  }

  return new OpenAI({
    apiKey,
  });
}

/*
|--------------------------------------------------------------------------
| V1 SUPPORTED IMAGE TYPES
|--------------------------------------------------------------------------
|
| File Intelligence V1 is deliberately limited to raster images.
|
| We are NOT pretending that AI, EPS, PSD, or production PDFs can be
| properly preflighted through this route.
|
*/

const supportedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/*
|--------------------------------------------------------------------------
| IMAGE DIMENSIONS
|--------------------------------------------------------------------------
|
| We extract pixel dimensions ourselves rather than asking the model
| to guess them visually.
|
*/

function getImageDimensions(
  buffer: Buffer,
  mimeType: string
): {
  width: number | null;
  height: number | null;
} {
  try {
    /*
    |--------------------------------------------------------------------------
    | PNG
    |--------------------------------------------------------------------------
    */

    if (
      mimeType === "image/png" &&
      buffer.length >= 24
    ) {
      const width =
        buffer.readUInt32BE(16);

      const height =
        buffer.readUInt32BE(20);

      return {
        width,
        height,
      };
    }

    /*
    |--------------------------------------------------------------------------
    | JPEG
    |--------------------------------------------------------------------------
    */

    if (
      mimeType === "image/jpeg"
    ) {
      let offset = 2;

      while (
        offset <
        buffer.length - 9
      ) {
        if (
          buffer[offset] !== 0xff
        ) {
          offset += 1;
          continue;
        }

        const marker =
          buffer[offset + 1];

        /*
         * Start-of-frame markers that
         * contain image dimensions.
         */

        const isSOF =
          marker === 0xc0 ||
          marker === 0xc1 ||
          marker === 0xc2 ||
          marker === 0xc3 ||
          marker === 0xc5 ||
          marker === 0xc6 ||
          marker === 0xc7 ||
          marker === 0xc9 ||
          marker === 0xca ||
          marker === 0xcb ||
          marker === 0xcd ||
          marker === 0xce ||
          marker === 0xcf;

        if (
          isSOF &&
          offset + 8 <
            buffer.length
        ) {
          const height =
            buffer.readUInt16BE(
              offset + 5
            );

          const width =
            buffer.readUInt16BE(
              offset + 7
            );

          return {
            width,
            height,
          };
        }

        if (
          offset + 3 >=
          buffer.length
        ) {
          break;
        }

        const segmentLength =
          buffer.readUInt16BE(
            offset + 2
          );

        if (
          segmentLength < 2
        ) {
          break;
        }

        offset +=
          2 + segmentLength;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | WEBP
    |--------------------------------------------------------------------------
    */

    if (
      mimeType === "image/webp" &&
      buffer.length >= 30
    ) {
      const chunkType =
        buffer
          .subarray(12, 16)
          .toString("ascii");

      /*
       * VP8X extended WebP
       */

      if (
        chunkType === "VP8X" &&
        buffer.length >= 30
      ) {
        const width =
          1 +
          buffer[24] +
          (buffer[25] << 8) +
          (buffer[26] << 16);

        const height =
          1 +
          buffer[27] +
          (buffer[28] << 8) +
          (buffer[29] << 16);

        return {
          width,
          height,
        };
      }
    }
  } catch (error) {
    console.error(
      "IMAGE DIMENSION ERROR:",
      error
    );
  }

  return {
    width: null,
    height: null,
  };
}

/*
|--------------------------------------------------------------------------
| FORMAT LABEL
|--------------------------------------------------------------------------
*/

function getFormat(
  mimeType: string
) {
  switch (mimeType) {
    case "image/jpeg":
      return "JPEG";

    case "image/png":
      return "PNG";

    case "image/webp":
      return "WEBP";

    default:
      return null;
  }
}

/*
|--------------------------------------------------------------------------
| POST IMAGE ANALYSIS
|--------------------------------------------------------------------------
|
| POST
| /api/projects/DCL-00031/files/[fileId]/analyze
|
*/

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      projectId: string;
      fileId: string;
    }>;
  }
) {
  const supabase =
    getSupabase();

  let analysisId:
    | string
    | null = null;

  try {
    const {
      projectId,
      fileId,
    } = await context.params;

    const openai =
      getOpenAI();

    /*
    |--------------------------------------------------------------------------
    | STEP 1: FIND PROJECT
    |--------------------------------------------------------------------------
    */

    const {
      data: project,
      error: projectError,
    } = await supabase
      .from("projects")
      .select(
        `
          id,
          project_number,
          title,
          product_type,
          pouch_size,
          box_dimensions,
          material,
          finish,
          closure,
          artwork_status
        `
      )
      .eq(
        "project_number",
        projectId
      )
      .maybeSingle();

    if (projectError) {
      throw new Error(
        `Project lookup failed: ${projectError.message}`
      );
    }

    if (!project) {
      return NextResponse.json(
        {
          error:
            `Project ${projectId} was not found.`,
        },
        {
          status: 404,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 2: FIND FILE
    |--------------------------------------------------------------------------
    |
    | Notice that we check BOTH:
    |
    | file ID
    | project UUID
    |
    | A file from another project cannot be analyzed through this URL.
    |
    */

    const {
      data: projectFile,
      error: fileError,
    } = await supabase
      .from("project_files")
      .select(
        `
          id,
          project_id,
          file_name,
          storage_path,
          file_type,
          file_size,
          category,
          uploaded_by,
          created_at
        `
      )
      .eq("id", fileId)
      .eq(
        "project_id",
        project.id
      )
      .maybeSingle();

    if (fileError) {
      throw new Error(
        `File lookup failed: ${fileError.message}`
      );
    }

    if (!projectFile) {
      return NextResponse.json(
        {
          error:
            "That file was not found in this project.",
        },
        {
          status: 404,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 3: VALIDATE IMAGE TYPE
    |--------------------------------------------------------------------------
    */

    const mimeType =
      projectFile.file_type ||
      "";

    if (
      !supportedMimeTypes.includes(
        mimeType as
          (typeof supportedMimeTypes)[number]
      )
    ) {
      return NextResponse.json(
        {
          error:
            "File Intelligence V1 currently supports JPG, PNG, and WEBP images only.",

          supportedTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
          ],

          file: {
            id:
              projectFile.id,

            file_name:
              projectFile.file_name,

            file_type:
              projectFile.file_type,
          },
        },
        {
          status: 415,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 4: CREATE / RESET ANALYSIS RECORD
    |--------------------------------------------------------------------------
    |
    | One current analysis exists per file in V1.
    |
    */

    const {
      data: analysisRecord,
      error: analysisRecordError,
    } = await supabase
      .from(
        "project_file_analyses"
      )
      .upsert(
        {
          file_id:
            projectFile.id,

          project_id:
            project.id,

          status:
            "processing",

          mime_type:
            mimeType,

          file_size:
            projectFile.file_size,

          format:
            getFormat(
              mimeType
            ),

          error_message:
            null,
        },
        {
          onConflict:
            "file_id",
        }
      )
      .select("id")
      .single();

    if (
      analysisRecordError
    ) {
      throw new Error(
        `Analysis record could not be created: ${analysisRecordError.message}`
      );
    }

    analysisId =
      analysisRecord.id;

    /*
    |--------------------------------------------------------------------------
    | STEP 5: DOWNLOAD PRIVATE FILE
    |--------------------------------------------------------------------------
    */

    const {
      data: fileBlob,
      error: downloadError,
    } =
      await supabase.storage
        .from(
          "project-files"
        )
        .download(
          projectFile.storage_path
        );

    if (downloadError) {
      throw new Error(
        `Private file download failed: ${downloadError.message}`
      );
    }

    if (!fileBlob) {
      throw new Error(
        "Supabase returned an empty file."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 6: CONVERT FILE TO BUFFER
    |--------------------------------------------------------------------------
    */

    const arrayBuffer =
      await fileBlob.arrayBuffer();

    const buffer =
      Buffer.from(
        arrayBuffer
      );

    if (
      buffer.length === 0
    ) {
      throw new Error(
        "Downloaded image is empty."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 7: TECHNICAL FACTS
    |--------------------------------------------------------------------------
    |
    | These come directly from the actual binary image.
    |
    | The AI does NOT invent these.
    |
    */

    const dimensions =
      getImageDimensions(
        buffer,
        mimeType
      );

    const format =
      getFormat(
        mimeType
      );

    /*
    |--------------------------------------------------------------------------
    | STEP 8: PREPARE IMAGE FOR VISION
    |--------------------------------------------------------------------------
    */

    const base64 =
      buffer.toString(
        "base64"
      );

    const dataUrl =
      `data:${mimeType};base64,${base64}`;

    /*
    |--------------------------------------------------------------------------
    | STEP 9: VISION ANALYSIS
    |--------------------------------------------------------------------------
    |
    | This is NOT a technical preflight.
    |
    | The model is being asked for visual observations and cautious
    | production interpretation only.
    |
    */

    const response =
      await openai.responses.create({
        model:
          "gpt-5.6-luna",

        input: [
          {
            role:
              "system",

            content: `
You are the File Intelligence system for DYE CUT LAB, a custom packaging production platform.

You are inspecting an uploaded raster image associated with a packaging project.

Your job is to produce careful VISUAL observations and cautious production-oriented guidance.

You must clearly distinguish between:

1. facts supplied by the server
2. things you can visibly observe in the image
3. things that CANNOT be verified from visual inspection alone

Do not pretend this is a true technical preflight.

You cannot verify from visual inspection alone:

- true physical print dimensions
- actual DPI/PPI at intended print size
- CMYK versus RGB color mode
- embedded ICC profiles
- spot colors
- Pantone definitions
- vector construction
- font embedding
- outlined fonts
- hidden layers
- bleed measurements
- trim box metadata
- dieline layer structure
- overprint settings
- trapping
- transparency flattening
- production separations
- whether the source artwork is genuinely print ready

Do not say an artwork is "print ready" or "production approved."

VISUAL SUMMARY:

Describe what is visibly present.

Keep it concise.

VISIBLE TEXT:

Transcribe clearly visible text when possible.

Do not invent text that is unreadable.

If there is no readable text, return null.

ARTWORK TYPE:

Choose a concise descriptive classification.

Examples:

"logo artwork"
"packaging design"
"product reference"
"photographic reference"
"graphic artwork"
"label artwork"
"unknown"

POSSIBLE CONCERNS:

Only mention concerns supported by the supplied technical facts or visible image.

Examples:

- visibly pixelated artwork
- extremely small raster dimensions
- obvious screenshot/interface elements
- obvious photographic background when isolated artwork may be needed
- important design elements visibly close to an apparent edge

Do not invent technical failures.

If no meaningful concern is visible, return null.

PRODUCTION NOTES:

Explain what this image appears useful for in the packaging workflow.

Be conservative.

RECOMMENDED NEXT STEP:

Give one practical next step.

Examples:

"Request the original vector artwork for production setup."

"Confirm intended physical print size before evaluating effective resolution."

"Use this image as a visual reference and request production artwork separately."

Never claim that your visual inspection replaces production preflight.
            `,
          },

          {
            role:
              "user",

            content: [
              {
                type:
                  "input_text",

                text:
                  JSON.stringify(
                    {
                      project: {
                        project_number:
                          project.project_number,

                        title:
                          project.title,

                        product_type:
                          project.product_type,

                        pouch_size:
                          project.pouch_size,

                        box_dimensions:
                          project.box_dimensions,

                        material:
                          project.material,

                        finish:
                          project.finish,

                        closure:
                          project.closure,

                        artwork_status:
                          project.artwork_status,
                      },

                      file: {
                        file_name:
                          projectFile.file_name,

                        category:
                          projectFile.category,

                        mime_type:
                          mimeType,

                        file_size_bytes:
                          buffer.length,

                        width_px:
                          dimensions.width,

                        height_px:
                          dimensions.height,
                      },
                    }
                  ),
              },

              {
                type:
                  "input_image",

                image_url:
                  dataUrl,

                detail:
                  "high",
              },
            ],
          },
        ],

        text: {
          format: {
            type:
              "json_schema",

            name:
              "dyecutlab_file_intelligence_v1",

            strict: true,

            schema: {
              type:
                "object",

              properties: {
                visual_summary: {
                  type:
                    "string",
                },

                visible_text: {
                  type: [
                    "string",
                    "null",
                  ],
                },

                artwork_type: {
                  type:
                    "string",
                },

                production_notes: {
                  type:
                    "string",
                },

                possible_concerns: {
                  type: [
                    "string",
                    "null",
                  ],
                },

                recommended_next_step: {
                  type:
                    "string",
                },
              },

              required: [
                "visual_summary",
                "visible_text",
                "artwork_type",
                "production_notes",
                "possible_concerns",
                "recommended_next_step",
              ],

              additionalProperties:
                false,
            },
          },
        },
      });

    /*
    |--------------------------------------------------------------------------
    | STEP 10: PARSE VISION RESULT
    |--------------------------------------------------------------------------
    */

    const output =
      response.output_text;

    if (!output) {
      throw new Error(
        "File Intelligence returned an empty response."
      );
    }

    const intelligence =
      JSON.parse(
        output
      );

    /*
    |--------------------------------------------------------------------------
    | STEP 11: SAVE COMPLETED ANALYSIS
    |--------------------------------------------------------------------------
    */

    const analyzedAt =
      new Date().toISOString();

    const {
      data: completedAnalysis,
      error: saveError,
    } = await supabase
      .from(
        "project_file_analyses"
      )
      .update({
        status:
          "completed",

        width_px:
          dimensions.width,

        height_px:
          dimensions.height,

        format,

        mime_type:
          mimeType,

        file_size:
          buffer.length,

        visual_summary:
          intelligence.visual_summary,

        visible_text:
          intelligence.visible_text,

        artwork_type:
          intelligence.artwork_type,

        production_notes:
          intelligence.production_notes,

        possible_concerns:
          intelligence.possible_concerns,

        recommended_next_step:
          intelligence.recommended_next_step,

        analysis_model:
          "gpt-5.6-luna",

        analysis_version:
          "v1",

        analyzed_at:
          analyzedAt,

        error_message:
          null,
      })
      .eq(
        "id",
        analysisId
      )
      .select("*")
      .single();

    if (saveError) {
      throw new Error(
        `Analysis could not be saved: ${saveError.message}`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | SUCCESS
    |--------------------------------------------------------------------------
    */

    console.log(
      "FILE INTELLIGENCE COMPLETE:",
      {
        projectId,
        fileId,
        fileName:
          projectFile.file_name,

        dimensions:
          `${dimensions.width || "?"}x${dimensions.height || "?"}`,
      }
    );

    return NextResponse.json({
      success: true,

      file: {
        id:
          projectFile.id,

        file_name:
          projectFile.file_name,

        category:
          projectFile.category,
      },

      technical: {
        width_px:
          dimensions.width,

        height_px:
          dimensions.height,

        format,

        mime_type:
          mimeType,

        file_size:
          buffer.length,
      },

      analysis:
        completedAnalysis,

      disclaimer:
        "File Intelligence V1 provides visual analysis, not a full production preflight.",
    });
  } catch (error) {
    console.error(
      "FILE INTELLIGENCE ERROR:",
      error
    );

    /*
    |--------------------------------------------------------------------------
    | MARK ANALYSIS AS FAILED
    |--------------------------------------------------------------------------
    */

    if (analysisId) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown analysis error.";

      const {
        error:
          failureSaveError,
      } = await supabase
        .from(
          "project_file_analyses"
        )
        .update({
          status:
            "failed",

          error_message:
            message,
        })
        .eq(
          "id",
          analysisId
        );

      if (
        failureSaveError
      ) {
        console.error(
          "ANALYSIS FAILURE SAVE ERROR:",
          failureSaveError
        );
      }
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "File Intelligence could not analyze this file.",
      },
      {
        status: 500,
      }
    );
  }
}
