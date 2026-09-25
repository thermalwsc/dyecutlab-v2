import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PDFArray, PDFDocument, PDFName, PDFNumber } from "pdf-lib";

/*
|--------------------------------------------------------------------------
| SUPABASE
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

/*
|--------------------------------------------------------------------------
| TYPES
|--------------------------------------------------------------------------
*/

type PdfBox = {
  x_pt: number;
  y_pt: number;
  width_pt: number;
  height_pt: number;
  x_in: number;
  y_in: number;
  width_in: number;
  height_in: number;
};

type PageInfo = {
  page: number;
  width_pt: number;
  height_pt: number;
  width_in: number;
  height_in: number;
  orientation:
    | "portrait"
    | "landscape"
    | "square";
  boxes: {
    media_box: PdfBox;
    crop_box: PdfBox | null;
    trim_box: PdfBox | null;
    bleed_box: PdfBox | null;
    crop_box_explicit: boolean;
    trim_box_explicit: boolean;
    bleed_box_explicit: boolean;
  };
  bleed: {
    status:
      | "verified"
      | "insufficient"
      | "cannot_verify";
    left_in: number | null;
    right_in: number | null;
    top_in: number | null;
    bottom_in: number | null;
    minimum_bleed_in: number | null;
  };
};

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function round(
  value: number,
  decimals = 2
) {
  const multiplier =
    10 ** decimals;

  return (
    Math.round(
      value * multiplier
    ) / multiplier
  );
}

function pointsToInches(
  points: number
) {
  return points / 72;
}

function getOrientation(
  width: number,
  height: number
):
  | "portrait"
  | "landscape"
  | "square" {
  const difference =
    Math.abs(width - height);

  if (difference < 0.01) {
    return "square";
  }

  return width > height
    ? "landscape"
    : "portrait";
}

function pdfBoxFromValues(
  x: number,
  y: number,
  width: number,
  height: number
): PdfBox {
  return {
    x_pt: round(x, 2),
    y_pt: round(y, 2),
    width_pt: round(width, 2),
    height_pt: round(height, 2),
    x_in: round(pointsToInches(x), 3),
    y_in: round(pointsToInches(y), 3),
    width_in: round(pointsToInches(width), 3),
    height_in: round(pointsToInches(height), 3),
  };
}

function readExplicitPageBox(
  page: ReturnType<PDFDocument["getPages"]>[number],
  name: "CropBox" | "TrimBox" | "BleedBox"
): PdfBox | null {
  const array = page.node.lookupMaybe(
    PDFName.of(name),
    PDFArray
  );

  if (!array || array.size() !== 4) {
    return null;
  }

  const values = [0, 1, 2, 3].map((index) => {
    const value = array.lookup(index, PDFNumber);
    return value.asNumber();
  });

  const [x1, y1, x2, y2] = values;

  return pdfBoxFromValues(
    x1,
    y1,
    x2 - x1,
    y2 - y1
  );
}

function calculateBleed(
  trimBox: PdfBox | null,
  bleedBox: PdfBox | null
) {
  if (!trimBox || !bleedBox) {
    return {
      status: "cannot_verify" as const,
      left_in: null,
      right_in: null,
      top_in: null,
      bottom_in: null,
      minimum_bleed_in: null,
    };
  }

  const trimLeft = trimBox.x_pt;
  const trimBottom = trimBox.y_pt;
  const trimRight =
    trimBox.x_pt + trimBox.width_pt;
  const trimTop =
    trimBox.y_pt + trimBox.height_pt;

  const bleedLeft = bleedBox.x_pt;
  const bleedBottom = bleedBox.y_pt;
  const bleedRight =
    bleedBox.x_pt + bleedBox.width_pt;
  const bleedTop =
    bleedBox.y_pt + bleedBox.height_pt;

  const left = pointsToInches(
    trimLeft - bleedLeft
  );
  const right = pointsToInches(
    bleedRight - trimRight
  );
  const top = pointsToInches(
    bleedTop - trimTop
  );
  const bottom = pointsToInches(
    trimBottom - bleedBottom
  );

  const minimum = Math.min(
    left,
    right,
    top,
    bottom
  );

  return {
    status:
      minimum > 0
        ? ("verified" as const)
        : ("insufficient" as const),
    left_in: round(left, 3),
    right_in: round(right, 3),
    top_in: round(top, 3),
    bottom_in: round(bottom, 3),
    minimum_bleed_in: round(minimum, 3),
  };
}

function pageSizesMatch(
  pages: PageInfo[]
) {
  if (pages.length <= 1) {
    return true;
  }

  const first =
    pages[0];

  return pages.every(
    (page) =>
      Math.abs(
        page.width_pt -
          first.width_pt
      ) < 0.01 &&
      Math.abs(
        page.height_pt -
          first.height_pt
      ) < 0.01
  );
}

/*
|--------------------------------------------------------------------------
| POST PDF PREFLIGHT
|--------------------------------------------------------------------------
|
| POST
|
| /api/projects/DCL-00031/files/[fileId]/preflight
|
| V2.1 performs structural PDF inspection.
|
| This is intentionally separate from File Intelligence V1.
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
  try {
    const {
      projectId,
      fileId,
    } = await context.params;

    const supabase =
      getSupabase();

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
          closure
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
      .eq(
        "id",
        fileId
      )
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
    | STEP 3: PDF ONLY
    |--------------------------------------------------------------------------
    */

    const fileName =
      projectFile.file_name.toLowerCase();

    const isPdf =
      projectFile.file_type ===
        "application/pdf" ||
      fileName.endsWith(".pdf");

    if (!isPdf) {
      return NextResponse.json(
        {
          error:
            "Production Preflight V2.1 currently supports PDF files only.",

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
    | STEP 4: DOWNLOAD PRIVATE PDF
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
        `Private PDF download failed: ${downloadError.message}`
      );
    }

    if (!fileBlob) {
      throw new Error(
        "Supabase returned an empty PDF."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 5: BUFFER
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
        "Downloaded PDF is empty."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 6: LOAD PDF
    |--------------------------------------------------------------------------
    |
    | pdf-lib parses the actual PDF structure.
    |
    | We are not asking an AI model to guess page dimensions.
    |
    */

    let pdfDocument:
      PDFDocument;

    try {
      pdfDocument =
        await PDFDocument.load(
          buffer,
          {
            ignoreEncryption:
              false,

            updateMetadata:
              false,
          }
        );
    } catch (error) {
      console.error(
        "PDF PARSE ERROR:",
        error
      );

      return NextResponse.json(
        {
          error:
            "The PDF could not be parsed. It may be encrypted, damaged, or use an unsupported PDF structure.",
        },
        {
          status: 422,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 7: DOCUMENT FACTS
    |--------------------------------------------------------------------------
    */

    const pageCount =
      pdfDocument.getPageCount();

    const pages =
      pdfDocument.getPages();

    const pageInfo: PageInfo[] =
      pages.map(
        (page, index) => {
          const {
            width,
            height,
          } = page.getSize();

          const media = page.getMediaBox();

          const mediaBox =
            pdfBoxFromValues(
              media.x,
              media.y,
              media.width,
              media.height
            );

          /*
          | We inspect the raw page dictionary for CropBox, TrimBox,
          | and BleedBox instead of relying on pdf-lib fallback getters.
          | This prevents a missing TrimBox/BleedBox from being reported
          | as explicitly defined merely because PDF defaults exist.
          */

          const cropBox =
            readExplicitPageBox(
              page,
              "CropBox"
            );

          const trimBox =
            readExplicitPageBox(
              page,
              "TrimBox"
            );

          const bleedBox =
            readExplicitPageBox(
              page,
              "BleedBox"
            );

          const bleed =
            calculateBleed(
              trimBox,
              bleedBox
            );

          return {
            page:
              index + 1,

            width_pt:
              round(
                width,
                2
              ),

            height_pt:
              round(
                height,
                2
              ),

            width_in:
              round(
                pointsToInches(
                  width
                ),
                3
              ),

            height_in:
              round(
                pointsToInches(
                  height
                ),
                3
              ),

            orientation:
              getOrientation(
                width,
                height
              ),

            boxes: {
              media_box:
                mediaBox,

              crop_box:
                cropBox,

              trim_box:
                trimBox,

              bleed_box:
                bleedBox,

              crop_box_explicit:
                cropBox !== null,

              trim_box_explicit:
                trimBox !== null,

              bleed_box_explicit:
                bleedBox !== null,
            },

            bleed,
          };
        }
      );

    const consistentPageSize =
      pageSizesMatch(
        pageInfo
      );

    /*
    |--------------------------------------------------------------------------
    | STEP 8: METADATA
    |--------------------------------------------------------------------------
    */

    const title =
      pdfDocument.getTitle() ||
      null;

    const author =
      pdfDocument.getAuthor() ||
      null;

    const subject =
      pdfDocument.getSubject() ||
      null;

    const creator =
      pdfDocument.getCreator() ||
      null;

    const producer =
      pdfDocument.getProducer() ||
      null;

    /*
    |--------------------------------------------------------------------------
    | STEP 9: STRUCTURAL OBSERVATIONS
    |--------------------------------------------------------------------------
    */

    const observations:
      string[] = [];

    const concerns:
      string[] = [];

    const firstPage =
      pageInfo[0] || null;

    if (pageCount === 1) {
      observations.push(
        "The PDF contains one page."
      );
    } else {
      observations.push(
        `The PDF contains ${pageCount} pages.`
      );
    }

    if (firstPage) {
      observations.push(
        `Page 1 measures ${firstPage.width_in} × ${firstPage.height_in} inches.`
      );
    }

    if (firstPage) {
      if (firstPage.boxes.trim_box) {
        observations.push(
          `Page 1 defines a TrimBox measuring ${firstPage.boxes.trim_box.width_in} × ${firstPage.boxes.trim_box.height_in} inches.`
        );
      } else {
        concerns.push(
          "Page 1 does not explicitly define a TrimBox, so final trim dimensions cannot be verified from the PDF box structure."
        );
      }

      if (firstPage.boxes.bleed_box) {
        observations.push(
          `Page 1 defines a BleedBox measuring ${firstPage.boxes.bleed_box.width_in} × ${firstPage.boxes.bleed_box.height_in} inches.`
        );
      } else {
        concerns.push(
          "Page 1 does not explicitly define a BleedBox, so bleed cannot be verified from the PDF box structure."
        );
      }

      if (firstPage.bleed.status === "verified") {
        observations.push(
          `Page 1 has a minimum calculated bleed of ${firstPage.bleed.minimum_bleed_in} inches.`
        );
      }

      if (firstPage.bleed.status === "insufficient") {
        concerns.push(
          "Page 1 has zero or negative calculated bleed on at least one side. Review the TrimBox and BleedBox before production."
        );
      }
    }

    if (
      pageCount > 1 &&
      consistentPageSize
    ) {
      observations.push(
        "All PDF pages use the same page dimensions."
      );
    }

    if (
      pageCount > 1 &&
      !consistentPageSize
    ) {
      concerns.push(
        "The PDF contains pages with different dimensions. Confirm that the mixed page sizes are intentional."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 10: BASIC PACKAGING CONTEXT
    |--------------------------------------------------------------------------
    |
    | This is deliberately conservative.
    |
    | A dieline document may be much larger than the final folded package,
    | so we DO NOT compare PDF page dimensions directly to finished package
    | dimensions and call a mismatch an error.
    |
    */

    if (
      project.product_type
    ) {
      observations.push(
        `This file belongs to a ${project.product_type} project.`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 11: V2.2 LIMITATIONS
    |--------------------------------------------------------------------------
    */

    const notVerified = [
      "dieline layer structure",
      "CMYK color mode",
      "ICC profiles",
      "Pantone or spot-color definitions",
      "font outlining or embedding",
      "overprint settings",
      "trapping",
      "transparency flattening",
      "image effective DPI",
      "vector construction",
      "production separations",
    ];

    const pdfBoxes = {
      pages: pageInfo.map((page) => ({
        page: page.page,
        ...page.boxes,
      })),
    };

    const bleedAnalysis = {
      pages: pageInfo.map((page) => ({
        page: page.page,
        ...page.bleed,
      })),
      all_pages_verifiable:
        pageInfo.length > 0 &&
        pageInfo.every(
          (page) =>
            page.bleed.status !==
            "cannot_verify"
        ),
      all_pages_have_positive_bleed:
        pageInfo.length > 0 &&
        pageInfo.every(
          (page) =>
            page.bleed.status ===
            "verified"
        ),
    };

    /*
    |--------------------------------------------------------------------------
    | STEP 12: RECOMMENDED NEXT STEP
    |--------------------------------------------------------------------------
    */

    let recommendedNextStep =
      "Continue with deeper production preflight before approving this PDF for manufacturing.";

    if (
      pageCount > 1 &&
      !consistentPageSize
    ) {
      recommendedNextStep =
        "Confirm that the different PDF page sizes are intentional before continuing with deeper production preflight.";
    }

    /*
    |--------------------------------------------------------------------------
    | SUCCESS
    |--------------------------------------------------------------------------
    */

    const preflight = {
      version:
        "v2.2",

      status:
        concerns.length > 0
          ? "review"
          : "structural_check_passed",

      file: {
        id:
          projectFile.id,

        file_name:
          projectFile.file_name,

        mime_type:
          projectFile.file_type,

        file_size:
          buffer.length,

        category:
          projectFile.category,
      },

      document: {
        format:
          "PDF",

        page_count:
          pageCount,

        consistent_page_size:
          consistentPageSize,

        pages:
          pageInfo,

        metadata: {
          title,
          author,
          subject,
          creator,
          producer,
        },
      },

      project_context: {
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
      },

      observations,

      concerns,

      pdf_boxes:
        pdfBoxes,

      bleed_analysis:
        bleedAnalysis,

      not_verified:
        notVerified,

      recommended_next_step:
        recommendedNextStep,

      disclaimer:
        "Production Preflight V2.2 inspects structural PDF data, explicit PDF page boxes, and calculable bleed. It does not constitute final production approval.",
    };

    /*
    |--------------------------------------------------------------------------
    | STEP 13: PERSIST PREFLIGHT RESULT
    |--------------------------------------------------------------------------
    |
    | One saved preflight per file.
    |
    | Re-running preflight updates the existing row because file_id is unique.
    |
    */

    const {
      data: savedPreflight,
      error: saveError,
    } = await supabase
      .from("project_file_preflights")
      .upsert(
        {
          file_id:
            projectFile.id,

          project_id:
            project.id,

          version:
            preflight.version,

          status:
            preflight.status,

          page_count:
            pageCount,

          consistent_page_size:
            consistentPageSize,

          pages:
            pageInfo,

          metadata: {
            title,
            author,
            subject,
            creator,
            producer,
          },

          observations,

          concerns,

          pdf_boxes:
            pdfBoxes,

          bleed_analysis:
            bleedAnalysis,

          not_verified:
            notVerified,

          recommended_next_step:
            recommendedNextStep,

          error_message:
            null,

          preflighted_at:
            new Date().toISOString(),

          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            "file_id",
        }
      )
      .select(
        `
          id,
          file_id,
          project_id,
          version,
          status,
          page_count,
          consistent_page_size,
          pages,
          metadata,
          observations,
          concerns,
          pdf_boxes,
          bleed_analysis,
          not_verified,
          recommended_next_step,
          error_message,
          preflighted_at,
          created_at,
          updated_at
        `
      )
      .single();

    if (saveError) {
      throw new Error(
        `PDF preflight persistence failed: ${saveError.message}`
      );
    }

    console.log(
      "PDF PREFLIGHT COMPLETE + SAVED:",
      {
        projectId,

        fileId,

        fileName:
          projectFile.file_name,

        pageCount,

        consistentPageSize,

        concernCount:
          concerns.length,

        preflightId:
          savedPreflight.id,
      }
    );

    return NextResponse.json({
      success: true,
      preflight,
      saved_preflight:
        savedPreflight,
    });
  } catch (error) {
    console.error(
      "PDF PREFLIGHT ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "PDF Production Preflight could not inspect this file.",
      },
      {
        status: 500,
      }
    );
  }
}