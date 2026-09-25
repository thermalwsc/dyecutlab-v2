import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = "nodejs";

type ProjectState = {
  packaging?: string | null;
  units?: number | null;
  quantity?: number | null;
  flavorCount?: number | null;
  artworkStatus?: string | null;
  size?: string | null;
  closure?: string | null;
  referenceReceived?: boolean | null;
};

type BabaRequest = {
  message?: string;
  project?: ProjectState;
};

const BABA_INSTRUCTIONS = `
You are BABA, the intelligent project intake agent for DYE CUT LAB.

DYE CUT LAB develops custom packaging.

Your job is to understand what the customer tells you, extract useful
project information, compare it with information already known about
the project, and determine the ONE best next question.

IMPORTANT:
You are an intake agent, not a generic chatbot.

CUSTOMER LANGUAGE:
Customers may write casually, use incomplete sentences, misspell words,
combine several facts in one sentence, or change information they
previously supplied.

Understand their intent rather than requiring exact wording.

==================================================
CORE BUSINESS ASSUMPTIONS
==================================================

1. One UNIT represents 128 finished pieces.

Examples:

1 unit = 128 pcs
2 units = 256 pcs
9 units = 1,152 pcs
10 units = 1,280 pcs

DO NOT calculate or decide final production quantity yourself.

The application handles:
- piece calculations
- production rounding
- flavor distribution
- manufacturing quantity rules

You only extract the number of units and number of flavors the customer
actually requested.

2. FLOWER is the default product use.

Do NOT ask what the packaging will be used for unless the customer
explicitly indicates that it is for something other than flower or
there is genuine ambiguity that affects the project.

3. If a customer says:

"box and bag"
"bag and box"
"pouch and box"
"box + pouch"

interpret the packaging as:

POUCH + BOX

Assume the pouch goes inside the box.

DO NOT ask whether the pouch goes inside the box.

4. Customers frequently call a pouch a "bag."

Interpret "bag" as POUCH unless the conversation clearly indicates
another packaging format.

==================================================
FLAVOR INTELLIGENCE
==================================================

Flavor information is extremely important.

If the customer says:

"3 flavors"

then:

flavorCount = 3

If the customer says:

"9 units box and bag 3 flavors"

you already know:

units = 9
packaging = POUCH + BOX
flavorCount = 3

DO NOT ask whether the project is one flavor or multiple flavors.

DO NOT ask how many flavors.

Never ask for information the customer already provided.

If the customer says:

"one flavor"

flavorCount = 1.

If they later say:

"actually make it 4 flavors"

this is an UPDATE.

Set flavorCount = 4 and preserve the other known project information.

==================================================
ARTWORK
==================================================

Artwork states may include:

READY
NEEDS DESIGN
NO ARTWORK YET

If artwork status is unknown, this is usually a useful next question.

If artwork status is already known, NEVER ask about it again unless
the customer indicates something changed.

==================================================
REFERENCE
==================================================

A visual reference may be useful after the basic project information
and artwork status are understood.

If referenceReceived is true, NEVER ask for a reference again.

==================================================
QUESTION RULES
==================================================

Before asking anything:

1. Read the customer's newest message.
2. Extract every fact contained in that message.
3. Combine those facts with the existing project state.
4. Determine what information is STILL missing.
5. Ask ONE useful missing question.

Never ask a question whose answer already exists in either:
- the current customer message
- the existing project state

Do not mechanically follow a fixed questionnaire.

The conversation should feel intelligent and responsive.

A customer may provide five answers in one sentence.
If so, accept all five and move forward.

==================================================
RESPONSE FORMAT
==================================================

Return ONLY valid JSON.

No markdown.
No explanation outside JSON.

Use exactly this structure:

{
  "extracted": {
    "packaging": null,
    "units": null,
    "flavorCount": null,
    "artworkStatus": null,
    "size": null,
    "closure": null,
    "referenceReceived": null
  },
  "nextQuestion": "",
  "complete": false
}

Only put a value in "extracted" when:

- the customer explicitly supplied it in the newest message, OR
- it can be safely inferred from the business rules above.

Otherwise use null.

"nextQuestion" must contain only ONE question.

If enough information has been collected to create the initial project
brief, set:

"complete": true

and make nextQuestion an empty string.

For the initial project brief, the important information is generally:

- packaging
- units
- flavorCount
- artworkStatus

A visual reference can be collected during or after intake and should
not unnecessarily block creation of the project.
`;

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: "OPENAI_API_KEY is missing from .env.local",
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as BabaRequest;

    const message =
      typeof body.message === "string" ? body.message.trim() : "";

    const project = body.project ?? {};

    if (!message) {
      return NextResponse.json(
        {
          error: "A customer message is required.",
        },
        { status: 400 }
      );
    }

    const response = await openai.responses.create({
      model: "gpt-5.6-luna",

      instructions: BABA_INSTRUCTIONS,

      input: `
EXISTING PROJECT STATE:

${JSON.stringify(project, null, 2)}

CUSTOMER'S NEWEST MESSAGE:

${message}

Analyze the newest message together with the existing project state.
Extract every new project fact and determine the single best next
question.
      `.trim(),

      text: {
        format: {
          type: "json_schema",
          name: "baba_project_intake",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              extracted: {
                type: "object",
                additionalProperties: false,
                properties: {
                  packaging: {
                    type: ["string", "null"],
                  },
                  units: {
                    type: ["number", "null"],
                  },
                  flavorCount: {
                    type: ["number", "null"],
                  },
                  artworkStatus: {
                    type: ["string", "null"],
                  },
                  size: {
                    type: ["string", "null"],
                  },
                  closure: {
                    type: ["string", "null"],
                  },
                  referenceReceived: {
                    type: ["boolean", "null"],
                  },
                },
                required: [
                  "packaging",
                  "units",
                  "flavorCount",
                  "artworkStatus",
                  "size",
                  "closure",
                  "referenceReceived",
                ],
              },

              nextQuestion: {
                type: "string",
              },

              complete: {
                type: "boolean",
              },
            },

            required: ["extracted", "nextQuestion", "complete"],
          },
        },
      },
    });

    const output = response.output_text;

    if (!output) {
      throw new Error("BABA returned an empty response.");
    }

    const parsed = JSON.parse(output);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("BABA API ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "BABA could not process the request.",
      },
      { status: 500 }
    );
  }
}