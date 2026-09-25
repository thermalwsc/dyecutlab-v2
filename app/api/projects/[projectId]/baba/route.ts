import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

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
| PROJECT FIELDS
|--------------------------------------------------------------------------
*/

const editableFields = [
  "units",
  "flavor_count",
  "pouch_size",
  "box_dimensions",
  "material",
  "finish",
  "closure",
  "artwork_status",
  "size",
] as const;

type EditableField =
  (typeof editableFields)[number];

/*
|--------------------------------------------------------------------------
| PRODUCTION CALCULATION
|--------------------------------------------------------------------------
|
| 1 unit = 128 finished packaging pieces.
|
| Production is rounded UP to the nearest 600 pieces.
|
*/

function calculateQuantity(
  units: number
) {
  const rawQuantity =
    units * 128;

  return (
    Math.ceil(
      rawQuantity / 600
    ) * 600
  );
}

function calculateFlavorSplit(
  quantity: number,
  flavorCount: number
) {
  if (
    !flavorCount ||
    flavorCount <= 0
  ) {
    return null;
  }

  return Math.ceil(
    quantity / flavorCount
  );
}

/*
|--------------------------------------------------------------------------
| SAVE MESSAGE
|--------------------------------------------------------------------------
*/

async function saveMessage(
  supabase: ReturnType<
    typeof getSupabase
  >,
  projectId: string,
  role: "user" | "baba",
  message: string
) {
  const { error } =
    await supabase
      .from("project_messages")
      .insert({
        project_id:
          projectId,
        role,
        message,
      });

  if (error) {
    console.error(
      "BABA MESSAGE SAVE ERROR:",
      error
    );

    throw new Error(
      `Project message could not be saved: ${error.message}`
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST BABA MESSAGE
|--------------------------------------------------------------------------
*/

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      projectId: string;
    }>;
  }
) {
  try {
    const { projectId } =
      await context.params;

    const supabase =
      getSupabase();

    const openai =
      getOpenAI();

    const body =
      await request.json();

    const message =
      typeof body.message ===
      "string"
        ? body.message.trim()
        : "";

    if (!message) {
      return NextResponse.json(
        {
          error:
            "A message is required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | LOAD CURRENT PROJECT
    |--------------------------------------------------------------------------
    */

    const {
      data: project,
      error: projectError,
    } = await supabase
      .from("projects")
      .select("*")
      .eq(
        "project_number",
        projectId
      )
      .maybeSingle();

    if (projectError) {
      console.error(
        "BABA PROJECT LOOKUP ERROR:",
        projectError
      );

      return NextResponse.json(
        {
          error:
            "Project could not be loaded.",

          details:
            projectError.message,
        },
        {
          status: 500,
        }
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
    | LOAD PROJECT FILES
    |--------------------------------------------------------------------------
    */

    const {
      data: projectFiles,
      error:
        projectFilesError,
    } = await supabase
      .from("project_files")
      .select(
        `
          id,
          file_name,
          file_type,
          file_size,
          category,
          uploaded_by,
          created_at
        `
      )
      .eq(
        "project_id",
        project.id
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (projectFilesError) {
      console.error(
        "BABA PROJECT FILE LOAD ERROR:",
        projectFilesError
      );

      return NextResponse.json(
        {
          error:
            "Project files could not be loaded for BABA.",

          details:
            projectFilesError.message,
        },
        {
          status: 500,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | LOAD FILE INTELLIGENCE
    |--------------------------------------------------------------------------
    |
    | BABA does NOT analyze the image here.
    |
    | It reads analysis that was already generated by our dedicated
    | File Intelligence system.
    |
    */

    const {
      data: fileAnalyses,
      error:
        fileAnalysesError,
    } = await supabase
      .from(
        "project_file_analyses"
      )
      .select(
        `
          id,
          file_id,
          status,
          width_px,
          height_px,
          format,
          mime_type,
          file_size,
          visual_summary,
          visible_text,
          artwork_type,
          production_notes,
          possible_concerns,
          recommended_next_step,
          analysis_model,
          analysis_version,
          analyzed_at
        `
      )
      .eq(
        "project_id",
        project.id
      )
      .eq(
        "status",
        "completed"
      )
      .order(
        "analyzed_at",
        {
          ascending: false,
        }
      );

    if (fileAnalysesError) {
      console.error(
        "BABA FILE INTELLIGENCE LOAD ERROR:",
        fileAnalysesError
      );

      return NextResponse.json(
        {
          error:
            "File Intelligence could not be loaded for BABA.",

          details:
            fileAnalysesError.message,
        },
        {
          status: 500,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | JOIN FILES + ANALYSIS
    |--------------------------------------------------------------------------
    |
    | This makes the context easier for BABA to reason about.
    |
    | Instead of receiving disconnected database rows, BABA sees:
    |
    | file
    | ├── metadata
    | └── analysis
    |
    */

    const filesWithIntelligence =
      (projectFiles || []).map(
        (file) => {
          const analysis =
            (
              fileAnalyses || []
            ).find(
              (item) =>
                item.file_id ===
                file.id
            ) || null;

          return {
            id: file.id,

            file_name:
              file.file_name,

            file_type:
              file.file_type,

            file_size:
              file.file_size,

            category:
              file.category,

            uploaded_by:
              file.uploaded_by,

            created_at:
              file.created_at,

            analysis,
          };
        }
      );

    /*
    |--------------------------------------------------------------------------
    | SAVE USER MESSAGE
    |--------------------------------------------------------------------------
    */

    await saveMessage(
      supabase,
      project.id,
      "user",
      message
    );

    /*
    |--------------------------------------------------------------------------
    | BABA
    |--------------------------------------------------------------------------
    */

    const response =
      await openai.responses.create({
        model:
          "gpt-5-mini",

        input: [
          {
            role:
              "system",

            content: `
You are BABA, the intelligent packaging project assistant for DYE CUT LAB.

You are assisting with an EXISTING packaging project.

You have access to:

1. The project's current production brief.
2. Files uploaded to the project.
3. Completed File Intelligence analysis for some uploaded files.
4. The customer's newest message.

Your job is to:

- answer questions about the project
- recognize uploaded files
- explain completed File Intelligence results
- identify useful production concerns from those results
- determine exactly which editable project fields the customer explicitly wants changed
- keep replies concise, useful, and natural

Do not invent information.

Do not change fields the user did not request to change.

PROJECT FILES:

You may receive projectFiles.

Each project file contains metadata such as:

- file_name
- file_type
- file_size
- category
- uploaded_by
- created_at

A file may also contain:

analysis

If analysis is null, that file has NOT been analyzed.

If analysis exists and status is "completed", File Intelligence has inspected that file.

FILE INTELLIGENCE:

Completed analysis can contain:

- width_px
- height_px
- format
- mime_type
- file_size
- visual_summary
- visible_text
- artwork_type
- production_notes
- possible_concerns
- recommended_next_step
- analysis_model
- analysis_version
- analyzed_at

When completed analysis exists, you ARE allowed to discuss those findings.

Example:

Customer:
"What do you think about the artwork?"

Analysis says:

width_px = 4167
height_px = 4167
artwork_type = "logo artwork"
possible_concerns = "Raster JPEG with a white background."
recommended_next_step = "Request original vector artwork."

Good response:

"I reviewed the stored File Intelligence analysis for your artwork. It's a 4167 × 4167 JPEG logo. The main concern is that it's raster artwork with a white background, so for production I'd recommend supplying the original vector logo with transparency."

IMPORTANT:

You are reading STORED FILE INTELLIGENCE.

Do not imply that you personally opened or inspected the file during this conversation.

Good wording:

"File Intelligence found..."

"The artwork analysis shows..."

"The analysis identified..."

"I have an analysis for..."

Avoid misleading wording such as:

"I just opened the file."

"I zoomed into the artwork."

"I inspected the layers."

TECHNICAL LIMITATIONS:

File Intelligence V1 is visual raster-image analysis.

A completed V1 analysis does NOT prove:

- physical print dimensions
- effective DPI at final physical size
- CMYK color mode
- ICC profile
- Pantone colors
- spot colors
- vector construction
- outlined fonts
- embedded fonts
- bleed measurements
- trim metadata
- dieline structure
- hidden layers
- overprint settings
- trapping
- production separations
- full print readiness

Never call V1 analysis a full technical preflight.

Never say a file is:

"print ready"

"production ready"

"approved for production"

based only on File Intelligence V1.

You may say:

"The analysis did not identify an obvious visual concern."

But this is NOT the same as technical approval.

FILES WITHOUT ANALYSIS:

If analysis is null, you only know the file metadata.

In that situation, do not claim you know what is visually inside the file.

If asked about its contents, explain that the file exists but has not been analyzed.

CAPABILITY HONESTY:

You can currently:

- read project brief information
- answer questions about the brief
- identify uploaded files
- read completed File Intelligence results
- discuss stored visual observations
- discuss stored possible concerns
- discuss stored recommended next steps
- update supported project brief fields

You cannot currently:

- perform a new file analysis from this BABA conversation
- perform a full production preflight
- inspect vector layers
- inspect PSD layers
- inspect AI document structure
- inspect EPS document structure
- verify CMYK
- verify Pantones
- verify actual bleed measurements
- verify fonts are outlined
- approve artwork for production
- edit artwork
- convert artwork
- send artwork to a factory

Do not offer capabilities that do not exist.

If an analysis already exists, you may explain it.

If no analysis exists, say that the file has not been analyzed yet.

ARTWORK STATUS:

An uploaded artwork file and artwork_status are separate things.

A completed File Intelligence analysis does NOT automatically change artwork_status.

Do not change artwork_status unless the customer's newest message explicitly requests or clearly states a status change.

CRITICAL PROJECT UPDATE RULE:

A field may only appear in changed_fields if the customer's NEWEST MESSAGE requests a change to that field.

Example:

Current project:

units = 16
finish = "soft touch"
material = "paperboard"

Customer:

"change my order to 20 units"

Then:

changed_fields = ["units"]

Do NOT include finish.

Do NOT include material.

Do NOT include unrelated fields.

EDITABLE FIELDS:

units
flavor_count
pouch_size
box_dimensions
material
finish
closure
artwork_status
size

FIELD DEFINITIONS:

units:
Number of order units requested by the customer.
Must be a positive integer.

flavor_count:
Number of flavors or product variants.
Must be a positive integer.

pouch_size:
Dimensions of the pouch.

Example:
"3.5 x 5 in"

box_dimensions:
Dimensions of the box.

Example:
"4 x 6 x 2 in"

material:
Packaging material.

Examples:
"paperboard"
"kraft paper"
"PET"
"mylar"

finish:
Surface finish.

Examples:
"matte"
"gloss"
"soft touch"
"holographic"

closure:
Packaging closure.

Examples:
"child-resistant zipper"
"standard zipper"
"heat seal"

artwork_status:
Status of customer artwork.

Examples:
"READY"
"NEEDS DESIGN"
"NO ARTWORK YET"

size:
General product size when applicable.

SERVER-CALCULATED FIELDS:

quantity
flavor_split

Never put quantity or flavor_split in changed_fields.

Never calculate quantity.

Never calculate flavor_split.

The server handles those automatically.

QUESTION-ONLY MESSAGES:

If the customer is only asking a question and is NOT requesting a project change:

changed_fields must be [].

Examples:

"what files do you have?"

"what do you think about my artwork?"

"what did the artwork analysis find?"

"what concerns do you see?"

"what is my finish?"

These should NOT modify the project.

REPLY STYLE:

Speak like a knowledgeable production assistant, not a database.

Do not dump raw JSON.

Do not unnecessarily mention timestamps, exact byte counts, model names, UUIDs, or database terminology unless the customer specifically asks.

Translate technical information into useful production guidance.

Prefer:

"Your logo is a 4167 × 4167 JPEG."

Instead of:

"image/jpeg, 585640 bytes, analyzed_at..."

When useful, distinguish:

WHAT WE KNOW

from

WHAT STILL NEEDS TO BE VERIFIED

without making the response unnecessarily long.

Return a short natural reply that directly addresses the customer's newest message.
            `,
          },

          {
            role:
              "user",

            content:
              JSON.stringify({
                currentProject:
                  project,

                projectFiles:
                  filesWithIntelligence,

                message,
              }),
          },
        ],

        text: {
          format: {
            type:
              "json_schema",

            name:
              "baba_project_update",

            strict: true,

            schema: {
              type:
                "object",

              properties: {
                changed_fields: {
                  type:
                    "array",

                  items: {
                    type:
                      "string",

                    enum: [
                      ...editableFields,
                    ],
                  },
                },

                values: {
                  type:
                    "object",

                  properties: {
                    units: {
                      type: [
                        "integer",
                        "null",
                      ],
                    },

                    flavor_count: {
                      type: [
                        "integer",
                        "null",
                      ],
                    },

                    pouch_size: {
                      type: [
                        "string",
                        "null",
                      ],
                    },

                    box_dimensions: {
                      type: [
                        "string",
                        "null",
                      ],
                    },

                    material: {
                      type: [
                        "string",
                        "null",
                      ],
                    },

                    finish: {
                      type: [
                        "string",
                        "null",
                      ],
                    },

                    closure: {
                      type: [
                        "string",
                        "null",
                      ],
                    },

                    artwork_status: {
                      type: [
                        "string",
                        "null",
                      ],
                    },

                    size: {
                      type: [
                        "string",
                        "null",
                      ],
                    },
                  },

                  required: [
                    "units",
                    "flavor_count",
                    "pouch_size",
                    "box_dimensions",
                    "material",
                    "finish",
                    "closure",
                    "artwork_status",
                    "size",
                  ],

                  additionalProperties:
                    false,
                },

                reply: {
                  type:
                    "string",
                },
              },

              required: [
                "changed_fields",
                "values",
                "reply",
              ],

              additionalProperties:
                false,
            },
          },
        },
      });

    /*
    |--------------------------------------------------------------------------
    | PARSE RESPONSE
    |--------------------------------------------------------------------------
    */

    const output =
      response.output_text;

    if (!output) {
      throw new Error(
        "BABA returned an empty response."
      );
    }

    const parsed =
      JSON.parse(output);

    const changedFields =
      Array.isArray(
        parsed.changed_fields
      )
        ? parsed.changed_fields
        : [];

    const values =
      parsed.values &&
      typeof parsed.values ===
        "object"
        ? parsed.values
        : {};

    const babaReply =
      typeof parsed.reply ===
        "string" &&
      parsed.reply.trim()
        ? parsed.reply.trim()
        : "Got it. I saved the new details to this project.";

    /*
    |--------------------------------------------------------------------------
    | BUILD PRECISE UPDATE
    |--------------------------------------------------------------------------
    */

    const updates: Record<
      string,
      unknown
    > = {};

    for (
      const field of changedFields
    ) {
      if (
        editableFields.includes(
          field as EditableField
        ) &&
        values[field] !== null &&
        values[field] !==
          undefined
      ) {
        updates[field] =
          values[field];
      }
    }

    /*
    |--------------------------------------------------------------------------
    | VALIDATE UNITS
    |--------------------------------------------------------------------------
    */

    if (
      updates.units !==
      undefined
    ) {
      const units =
        Number(
          updates.units
        );

      if (
        !Number.isInteger(
          units
        ) ||
        units <= 0
      ) {
        return NextResponse.json(
          {
            error:
              "Units must be a positive whole number.",
          },
          {
            status: 400,
          }
        );
      }

      updates.units =
        units;
    }

    /*
    |--------------------------------------------------------------------------
    | VALIDATE FLAVOR COUNT
    |--------------------------------------------------------------------------
    */

    if (
      updates.flavor_count !==
      undefined
    ) {
      const flavorCount =
        Number(
          updates.flavor_count
        );

      if (
        !Number.isInteger(
          flavorCount
        ) ||
        flavorCount <= 0
      ) {
        return NextResponse.json(
          {
            error:
              "Flavor count must be a positive whole number.",
          },
          {
            status: 400,
          }
        );
      }

      updates.flavor_count =
        flavorCount;
    }

    /*
    |--------------------------------------------------------------------------
    | DERIVED VALUES
    |--------------------------------------------------------------------------
    */

    if (
      updates.units !==
        undefined ||
      updates.flavor_count !==
        undefined
    ) {
      const finalUnits =
        updates.units !==
        undefined
          ? Number(
              updates.units
            )
          : Number(
              project.units
            );

      const finalFlavorCount =
        updates.flavor_count !==
        undefined
          ? Number(
              updates.flavor_count
            )
          : Number(
              project.flavor_count
            );

      const quantity =
        calculateQuantity(
          finalUnits
        );

      const flavorSplit =
        calculateFlavorSplit(
          quantity,
          finalFlavorCount
        );

      updates.quantity =
        quantity;

      updates.flavor_split =
        flavorSplit;
    }

    /*
    |--------------------------------------------------------------------------
    | NO PROJECT CHANGE
    |--------------------------------------------------------------------------
    */

    if (
      Object.keys(
        updates
      ).length === 0
    ) {
      await saveMessage(
        supabase,
        project.id,
        "baba",
        babaReply
      );

      return NextResponse.json({
        success: true,

        changedFields: [],

        updates: {},

        project,

        reply:
          babaReply,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | SAVE PROJECT UPDATE
    |--------------------------------------------------------------------------
    */

    const {
      error: updateError,
    } = await supabase
      .from("projects")
      .update(updates)
      .eq(
        "id",
        project.id
      );

    if (updateError) {
      console.error(
        "BABA PROJECT UPDATE ERROR:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "BABA understood the change but could not save it.",

          details:
            updateError.message,
        },
        {
          status: 500,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | RELOAD PROJECT
    |--------------------------------------------------------------------------
    */

    const {
      data: updatedProject,
      error: refreshError,
    } = await supabase
      .from("projects")
      .select("*")
      .eq(
        "id",
        project.id
      )
      .single();

    if (refreshError) {
      console.error(
        "BABA PROJECT REFRESH ERROR:",
        refreshError
      );

      return NextResponse.json(
        {
          error:
            "Project was updated but could not be reloaded.",

          details:
            refreshError.message,
        },
        {
          status: 500,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | SAVE BABA REPLY
    |--------------------------------------------------------------------------
    */

    await saveMessage(
      supabase,
      project.id,
      "baba",
      babaReply
    );

    /*
    |--------------------------------------------------------------------------
    | SUCCESS
    |--------------------------------------------------------------------------
    */

    console.log(
      "BABA PROJECT UPDATED:",
      {
        projectId,

        changedFields,

        updates,

        projectFileCount:
          projectFiles?.length ||
          0,

        analyzedFileCount:
          fileAnalyses?.length ||
          0,
      }
    );

    return NextResponse.json({
      success: true,

      changedFields,

      updates,

      project:
        updatedProject,

      reply:
        babaReply,
    });
  } catch (error) {
    console.error(
      "BABA PROJECT ROUTE ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "BABA could not process the project update.",
      },
      {
        status: 500,
      }
    );
  }
}