"use client";

import {
  ChangeEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams } from "next/navigation";

type Project = {
  id: string;
  project_number: string;
  title: string | null;
  request: string | null;
  quantity: number | null;
  product_type: string | null;
  use_type: string | null;
  status: string | null;
  artwork_status: string | null;
  size: string | null;
  closure: string | null;
  units: number | null;
  flavor_count: number | null;
  flavor_split: number | null;
  pouch_size: string | null;
  box_dimensions: string | null;
  material: string | null;
  finish: string | null;
};

type Message = {
  id?: string;
  role: "baba" | "user";
  text: string;
  created_at?: string;
};

type StoredMessage = {
  id: string;
  role: "baba" | "user";
  message: string;
  created_at: string;
};

type FileCategory =
  | "artwork"
  | "reference"
  | "production"
  | "sample"
  | "other";

type FileAnalysis = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  width_px: number | null;
  height_px: number | null;
  format: string | null;
  visual_summary: string | null;
  visible_text: string | null;
  artwork_type: string | null;
  production_notes: string | null;
  possible_concerns: string | null;
  recommended_next_step: string | null;
  analyzed_at: string | null;
  error_message: string | null;
};

type FilePreflightPage = {
  page: number;
  width_pt: number;
  height_pt: number;
  width_in: number;
  height_in: number;
  orientation: "portrait" | "landscape" | "square";
};

type FilePreflight = {
  id: string;
  version: string;
  status: string;
  page_count: number | null;
  consistent_page_size: boolean | null;
  pages: FilePreflightPage[] | null;
  metadata: Record<string, string | null> | null;
  observations: string[] | null;
  concerns: string[] | null;
  pdf_boxes?: {
    pages?: Array<{
      page: number;
      media_box?: Record<string, number> | null;
      crop_box?: Record<string, number> | null;
      trim_box?: Record<string, number> | null;
      bleed_box?: Record<string, number> | null;
      crop_box_explicit?: boolean;
      trim_box_explicit?: boolean;
      bleed_box_explicit?: boolean;
    }>;
  } | null;
  bleed_analysis?: {
    pages?: Array<{
      page: number;
      status: "verified" | "insufficient" | "cannot_verify";
      left_in: number | null;
      right_in: number | null;
      top_in: number | null;
      bottom_in: number | null;
      minimum_bleed_in: number | null;
    }>;
    all_pages_verifiable?: boolean;
    all_pages_have_positive_bleed?: boolean;
  } | null;
  not_verified: string[] | null;
  recommended_next_step: string | null;
  preflighted_at: string | null;
  error_message: string | null;
};

type ProjectFile = {
  id: string;
  file_name: string;
  storage_path: string;
  file_type: string | null;
  file_size: number | null;
  category: FileCategory;
  uploaded_by: string;
  created_at: string;
  url: string | null;
  analysis?: FileAnalysis | null;
  preflight?: FilePreflight | null;
};

const fileCategories: {
  value: FileCategory;
  label: string;
}[] = [
  {
    value: "artwork",
    label: "ARTWORK",
  },
  {
    value: "reference",
    label: "REFERENCE",
  },
  {
    value: "production",
    label: "PRODUCTION",
  },
  {
    value: "sample",
    label: "SAMPLE",
  },
  {
    value: "other",
    label: "OTHER",
  },
];

export default function ProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [project, setProject] =
    useState<Project | null>(null);

  const [loading, setLoading] = useState(true);

  const [messagesLoading, setMessagesLoading] =
    useState(true);

  const [messages, setMessages] = useState<Message[]>(
    []
  );

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [filesLoading, setFilesLoading] =
    useState(true);

  const [uploading, setUploading] =
    useState(false);

  const [uploadError, setUploadError] = useState<
    string | null
  >(null);

  const [analyzingFileId, setAnalyzingFileId] =
    useState<string | null>(null);

  const [fileAnalyses, setFileAnalyses] = useState<
    Record<string, FileAnalysis>
  >({});

  const [analysisErrors, setAnalysisErrors] = useState<
    Record<string, string>
  >({});

  const [preflightingFileId, setPreflightingFileId] =
    useState<string | null>(null);

  const [filePreflights, setFilePreflights] = useState<
    Record<string, FilePreflight>
  >({});

  const [preflightErrors, setPreflightErrors] = useState<
    Record<string, string>
  >({});

  const [selectedCategory, setSelectedCategory] =
    useState<FileCategory>("artwork");

  const messagesEndRef =
    useRef<HTMLDivElement | null>(null);

  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  /*
  |--------------------------------------------------------------------------
  | LOAD PROJECT
  |--------------------------------------------------------------------------
  */

  async function loadProject() {
    try {
      const response = await fetch(
        `/api/projects/${projectId}`,
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("PROJECT LOAD ERROR:", data);
        return;
      }

      setProject(data.project);
    } catch (error) {
      console.error("PROJECT LOAD ERROR:", error);
    } finally {
      setLoading(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | LOAD BABA HISTORY
  |--------------------------------------------------------------------------
  */

  async function loadMessages() {
    try {
      setMessagesLoading(true);

      const response = await fetch(
        `/api/projects/${projectId}/messages`,
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("MESSAGE LOAD ERROR:", data);
        return;
      }

      const storedMessages: StoredMessage[] =
        Array.isArray(data.messages)
          ? data.messages
          : [];

      setMessages(
        storedMessages.map((item) => ({
          id: item.id,
          role: item.role,
          text: item.message,
          created_at: item.created_at,
        }))
      );
    } catch (error) {
      console.error("MESSAGE LOAD ERROR:", error);
    } finally {
      setMessagesLoading(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | LOAD PROJECT FILES
  |--------------------------------------------------------------------------
  */

  async function loadFiles() {
    try {
      setFilesLoading(true);

      const response = await fetch(
        `/api/projects/${projectId}/files`,
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("PROJECT FILE LOAD ERROR:", data);
        return;
      }

      const loadedFiles: ProjectFile[] =
        Array.isArray(data.files)
          ? data.files
          : [];

      setFiles(loadedFiles);

      const loadedAnalyses: Record<
        string,
        FileAnalysis
      > = {};

      for (const file of loadedFiles) {
        if (
          file.analysis &&
          file.analysis.status === "completed"
        ) {
          loadedAnalyses[file.id] =
            file.analysis;
        }
      }

      setFileAnalyses(
        loadedAnalyses
      );

      const loadedPreflights: Record<
        string,
        FilePreflight
      > = {};

      for (const file of loadedFiles) {
        if (file.preflight) {
          loadedPreflights[file.id] =
            file.preflight;
        }
      }

      setFilePreflights(
        loadedPreflights
      );
    } catch (error) {
      console.error(
        "PROJECT FILE LOAD ERROR:",
        error
      );
    } finally {
      setFilesLoading(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | INITIAL LOAD
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!projectId) {
      return;
    }

    loadProject();
    loadMessages();
    loadFiles();
  }, [projectId]);

  /*
  |--------------------------------------------------------------------------
  | CHAT SCROLL
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (messagesLoading) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [messages, sending, messagesLoading]);

  /*
  |--------------------------------------------------------------------------
  | UPLOAD PROJECT FILE
  |--------------------------------------------------------------------------
  */

  async function handleFileUpload(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const selectedFile =
      event.target.files?.[0];

    if (!selectedFile || uploading) {
      return;
    }

    try {
      setUploading(true);
      setUploadError(null);

      const formData = new FormData();

      formData.append("file", selectedFile);

      formData.append(
        "category",
        selectedCategory
      );

      const response = await fetch(
        `/api/projects/${projectId}/files`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            data?.details ||
            "File could not be uploaded."
        );
      }

      /*
       * Put the new file at the top immediately.
       */

      if (data.file) {
        const uploadedFile =
          data.file as ProjectFile;

        setFiles((current) => [
          uploadedFile,
          ...current,
        ]);

        const supportsFileIntelligence =
          uploadedFile.file_type === "image/jpeg" ||
          uploadedFile.file_type === "image/png" ||
          uploadedFile.file_type === "image/webp";

        if (supportsFileIntelligence) {
          void analyzeFile(uploadedFile);
        }

        const supportsProductionPreflight =
          uploadedFile.file_type === "application/pdf" ||
          uploadedFile.file_name.toLowerCase().endsWith(".pdf");

        if (supportsProductionPreflight) {
          void preflightFile(uploadedFile);
        }
      } else {
        await loadFiles();
      }

      /*
       * Clear the browser file input so the same
       * file can be selected again if necessary.
       */

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error(
        "PROJECT FILE UPLOAD ERROR:",
        error
      );

      setUploadError(
        error instanceof Error
          ? error.message
          : "File could not be uploaded."
      );
    } finally {
      setUploading(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | ANALYZE PROJECT FILE
  |--------------------------------------------------------------------------
  */

  async function analyzeFile(file: ProjectFile) {
    if (analyzingFileId) {
      return;
    }

    try {
      setAnalyzingFileId(file.id);

      setAnalysisErrors((current) => {
        const next = { ...current };
        delete next[file.id];
        return next;
      });

      const response = await fetch(
        `/api/projects/${projectId}/files/${file.id}/analyze`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "File Intelligence could not analyze this file."
        );
      }

      if (data.analysis) {
        setFileAnalyses((current) => ({
          ...current,
          [file.id]: data.analysis,
        }));
      }
    } catch (error) {
      console.error("FILE INTELLIGENCE ERROR:", error);

      setAnalysisErrors((current) => ({
        ...current,
        [file.id]:
          error instanceof Error
            ? error.message
            : "File Intelligence could not analyze this file.",
      }));
    } finally {
      setAnalyzingFileId(null);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | PREFLIGHT PDF
  |--------------------------------------------------------------------------
  */

  async function preflightFile(file: ProjectFile) {
    if (preflightingFileId) {
      return;
    }

    try {
      setPreflightingFileId(file.id);

      setPreflightErrors((current) => {
        const next = { ...current };
        delete next[file.id];
        return next;
      });

      const response = await fetch(
        `/api/projects/${projectId}/files/${file.id}/preflight`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Production Preflight could not inspect this PDF."
        );
      }

      const saved =
        data.saved_preflight || data.preflight;

      if (saved) {
        setFilePreflights((current) => ({
          ...current,
          [file.id]: saved,
        }));
      }
    } catch (error) {
      console.error("PRODUCTION PREFLIGHT ERROR:", error);

      setPreflightErrors((current) => ({
        ...current,
        [file.id]:
          error instanceof Error
            ? error.message
            : "Production Preflight could not inspect this PDF.",
      }));
    } finally {
      setPreflightingFileId(null);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | SEND MESSAGE TO BABA
  |--------------------------------------------------------------------------
  */

  async function sendMessage() {
    const cleanMessage = input.trim();

    if (!cleanMessage || sending) {
      return;
    }

    setInput("");
    setSending(true);

    setMessages((current) => [
      ...current,
      {
        role: "user",
        text: cleanMessage,
      },
    ]);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/baba`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            message: cleanMessage,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "BABA could not update the project."
        );
      }

      if (data.project) {
        setProject(data.project);
      } else {
        await loadProject();
      }

      setMessages((current) => [
        ...current,
        {
          role: "baba",
          text:
            data.reply ||
            "Got it. I saved the new details to this project.",
        },
      ]);
    } catch (error) {
      console.error("BABA ERROR:", error);

      setMessages((current) => [
        ...current,
        {
          role: "baba",
          text:
            "I couldn't save that change. Please try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      sendMessage();
    }
  }

  /*
  |--------------------------------------------------------------------------
  | LOADING
  |--------------------------------------------------------------------------
  */

  if (loading) {
    return (
      <main className="loading-screen">
        <span className="status-dot" />
        LOADING PROJECT
        <style jsx>{styles}</style>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="loading-screen">
        PROJECT NOT FOUND
        <style jsx>{styles}</style>
      </main>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | DISPLAY VALUES
  |--------------------------------------------------------------------------
  */

  const status =
    project.status?.toUpperCase() ||
    "DEVELOPMENT";

  const quantity =
    project.quantity != null
      ? `${project.quantity.toLocaleString()} PCS`
      : "NOT SET";

  const units =
    project.units != null
      ? project.units.toLocaleString()
      : "NOT SET";

  const flavors =
    project.flavor_count &&
    project.flavor_split
      ? `${project.flavor_count} × ${project.flavor_split.toLocaleString()} PCS`
      : project.flavor_count
      ? `${project.flavor_count}`
      : "NOT SET";

  const artwork =
    project.artwork_status ||
    "NO ARTWORK YET";

  const briefFields = [
    project.pouch_size,
    project.box_dimensions,
    project.material,
    project.finish,
    project.closure,
  ];

  const completedFields =
    briefFields.filter(
      (value) =>
        value &&
        String(value).trim().length > 0
    ).length;

  const briefComplete =
    completedFields === 5;

  return (
    <>
      <main className="page">
        {/* HEADER */}

        <header className="topbar">
          <button
            className="icon-button"
            onClick={() =>
              window.history.back()
            }
            aria-label="Go back"
          >
            ←
          </button>

          <div className="project-header">
            <div className="project-number">
              {project.project_number}
            </div>

            <div className="project-status">
              <span className="status-dot" />
              {status}
            </div>
          </div>

          <button
            className="icon-button menu-button"
            aria-label="Project menu"
          >
            ···
          </button>
        </header>

        <div className="content">
          {/* HERO */}

          <section className="hero">
            <div className="eyebrow">
              PROJECT WORKSPACE
            </div>

            <h1>
              {project.title ||
                "UNTITLED PROJECT"}
            </h1>

            <div className="hero-meta">
              {project.units ?? "—"} UNITS
              <span>·</span>
              {project.flavor_count ?? "—"}{" "}
              FLAVORS
            </div>
          </section>

          {/* PROJECT STATUS */}

          <section className="section status-section">
            <div className="eyebrow">
              PROJECT STATUS
            </div>

            <div className="timeline">
              <TimelineStep
                label="BRIEF"
                active={true}
              />

              <TimelineLine />

              <TimelineStep
                label="DESIGN"
                active={false}
              />

              <TimelineLine />

              <TimelineStep
                label="SAMPLE"
                active={false}
              />

              <TimelineLine />

              <TimelineStep
                label="PRODUCTION"
                active={false}
              />
            </div>

            <div className="current-card">
              <div className="small-label">
                CURRENTLY
              </div>

              <strong>
                {briefComplete
                  ? "BRIEF COMPLETE"
                  : "BRIEF DEVELOPMENT"}
              </strong>
            </div>
          </section>

          {/* PROJECT BRIEF */}

          <section className="section brief-section">
            <div className="section-heading">
              <div className="eyebrow">
                PROJECT BRIEF
              </div>

              <div className="completion">
                {completedFields}/5 COMPLETE
              </div>
            </div>

            <div className="brief-grid">
              <BriefItem
                label="QUANTITY"
                value={quantity}
              />

              <BriefItem
                label="UNITS"
                value={units}
              />

              <BriefItem
                label="FLAVORS"
                value={flavors}
              />

              <BriefItem
                label="USE"
                value={
                  project.use_type ||
                  "NOT SET"
                }
              />

              <BriefItem
                label="POUCH SIZE"
                value={
                  project.pouch_size ||
                  "NOT SET"
                }
              />

              <BriefItem
                label="BOX DIMENSIONS"
                value={
                  project.box_dimensions ||
                  "NOT SET"
                }
              />

              <BriefItem
                label="MATERIAL"
                value={
                  project.material ||
                  "NOT SET"
                }
              />

              <BriefItem
                label="FINISH"
                value={
                  project.finish ||
                  "NOT SET"
                }
              />

              <BriefItem
                label="CLOSURE"
                value={
                  project.closure ||
                  "NOT SET"
                }
              />

              <BriefItem
                label="ARTWORK"
                value={artwork}
              />
            </div>
          </section>

          {/* PROJECT FILES */}

          <section className="section files-section">
            <div className="files-heading">
              <div>
                <div className="eyebrow">
                  PROJECT FILES
                </div>

                <div className="files-count">
                  {files.length}{" "}
                  {files.length === 1
                    ? "FILE"
                    : "FILES"}
                </div>
              </div>

              <button
                className="upload-button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                disabled={uploading}
              >
                {uploading
                  ? "UPLOADING..."
                  : "+ UPLOAD FILE"}
              </button>
            </div>

            <input
              ref={fileInputRef}
              className="hidden-file-input"
              type="file"
              onChange={handleFileUpload}
            />

            <div className="category-row">
              {fileCategories.map(
                (category) => (
                  <button
                    key={category.value}
                    className={
                      selectedCategory ===
                      category.value
                        ? "category-button category-button-active"
                        : "category-button"
                    }
                    onClick={() =>
                      setSelectedCategory(
                        category.value
                      )
                    }
                    disabled={uploading}
                  >
                    {category.label}
                  </button>
                )
              )}
            </div>

            <div className="category-help">
              New uploads will be saved as{" "}
              <strong>
                {selectedCategory.toUpperCase()}
              </strong>
              .
            </div>

            {uploadError && (
              <div className="upload-error">
                {uploadError}
              </div>
            )}

            {filesLoading && (
              <div className="files-loading">
                LOADING PROJECT FILES...
              </div>
            )}

            {!filesLoading &&
              files.length === 0 && (
                <div className="empty-files">
                  <div className="empty-file-icon">
                    +
                  </div>

                  <div>
                    <strong>
                      NO PROJECT FILES YET
                    </strong>

                    <p>
                      Upload artwork,
                      references, production
                      files, or sample
                      documentation.
                    </p>
                  </div>
                </div>
              )}

            {!filesLoading &&
              files.length > 0 && (
                <div className="file-list">
                  {files.map((file) => (
                    <ProjectFileCard
                      key={file.id}
                      file={file}
                      analysis={fileAnalyses[file.id] || null}
                      analyzing={analyzingFileId === file.id}
                      analysisError={analysisErrors[file.id] || null}
                      analysisLocked={
                        analyzingFileId !== null &&
                        analyzingFileId !== file.id
                      }
                      onAnalyze={() => analyzeFile(file)}
                      preflight={filePreflights[file.id] || null}
                      preflighting={preflightingFileId === file.id}
                      preflightError={preflightErrors[file.id] || null}
                      preflightLocked={
                        preflightingFileId !== null &&
                        preflightingFileId !== file.id
                      }
                      onPreflight={() => preflightFile(file)}
                    />
                  ))}
                </div>
              )}
          </section>

          {/* BABA */}

          <section
            className={
              briefComplete
                ? "baba-section baba-section-complete"
                : "baba-section"
            }
          >
            <div className="baba-heading">
              <div>
                <div className="eyebrow">
                  BABA
                </div>

                <div className="baba-online">
                  <span className="status-dot" />
                  ONLINE
                </div>
              </div>

              <BabaAvatar large />
            </div>

            {briefComplete && (
              <div className="baba-mode">
                PROJECT ASSISTANT
                <span>BRIEF READY</span>
              </div>
            )}

            <div className="conversation">
              {messagesLoading && (
                <div className="history-loading">
                  LOADING CONVERSATION...
                </div>
              )}

              {!messagesLoading &&
                messages.length === 0 && (
                  <div className="message-row baba-row">
                    <BabaAvatar />

                    <div className="message baba-message">
                      Your production brief
                      is ready. Message me
                      whenever you want to
                      update or discuss this
                      project.
                    </div>
                  </div>
                )}

              {!messagesLoading &&
                messages.map(
                  (message, index) => {
                    if (
                      message.role === "user"
                    ) {
                      return (
                        <div
                          className="message-row user-row"
                          key={
                            message.id ||
                            `user-${index}`
                          }
                        >
                          <div className="message user-message">
                            {message.text}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        className="message-row baba-row"
                        key={
                          message.id ||
                          `baba-${index}`
                        }
                      >
                        <BabaAvatar />

                        <div className="message baba-message">
                          {message.text}
                        </div>
                      </div>
                    );
                  }
                )}

              {sending && (
                <div className="message-row baba-row">
                  <BabaAvatar />

                  <div className="thinking">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </section>

          <div className="input-spacer" />
        </div>
      </main>

      {/* MESSAGE BABA */}

      <div className="composer-shell">
        <div className="composer-inner">
          <div className="composer">
            <input
              value={input}
              onChange={(event) =>
                setInput(
                  event.target.value
                )
              }
              onKeyDown={handleKeyDown}
              placeholder={
                sending
                  ? "BABA is thinking..."
                  : "Message BABA"
              }
              disabled={sending}
            />

            <button
              className="send-button"
              onClick={sendMessage}
              disabled={
                sending || !input.trim()
              }
              aria-label="Send message"
            >
              ↑
            </button>
          </div>
        </div>
      </div>

      <style jsx>{styles}</style>
    </>
  );
}

/*
|--------------------------------------------------------------------------
| PROJECT FILE CARD
|--------------------------------------------------------------------------
*/

function ProjectFileCard({
  file,
  analysis,
  analyzing,
  analysisError,
  analysisLocked,
  onAnalyze,
  preflight,
  preflighting,
  preflightError,
  preflightLocked,
  onPreflight,
}: {
  file: ProjectFile;
  analysis: FileAnalysis | null;
  analyzing: boolean;
  analysisError: string | null;
  analysisLocked: boolean;
  onAnalyze: () => void;
  preflight: FilePreflight | null;
  preflighting: boolean;
  preflightError: string | null;
  preflightLocked: boolean;
  onPreflight: () => void;
}) {
  const extension = getFileExtension(
    file.file_name
  );

  const size = formatFileSize(
    file.file_size
  );

  const canAnalyze =
    file.file_type === "image/jpeg" ||
    file.file_type === "image/png" ||
    file.file_type === "image/webp";

  const canPreflight =
    file.file_type === "application/pdf" ||
    file.file_name.toLowerCase().endsWith(".pdf");

  const firstBoxPage =
    preflight?.pdf_boxes?.pages?.[0] || null;

  const firstBleedPage =
    preflight?.bleed_analysis?.pages?.[0] || null;

  const hasMeasuredWarning =
    firstBleedPage?.status === "insufficient" ||
    preflight?.consistent_page_size === false;

  const hasUnverifiedProductionData =
    Boolean(
      preflight &&
        (
          !firstBoxPage?.trim_box_explicit ||
          !firstBoxPage?.bleed_box_explicit ||
          firstBleedPage?.status === "cannot_verify" ||
          (preflight.not_verified?.length || 0) > 0
        )
    );

  const preflightDisplayStatus =
    !preflight
      ? "NOT PREFLIGHTED"
      : hasMeasuredWarning
      ? "WARNING"
      : hasUnverifiedProductionData
      ? "PREFLIGHT INCOMPLETE"
      : "VERIFIED";

  const preflightStatusClass =
    !preflight
      ? "intelligence-status"
      : hasMeasuredWarning
      ? "intelligence-status preflight-status-warning"
      : hasUnverifiedProductionData
      ? "intelligence-status preflight-status-unverified"
      : "intelligence-status intelligence-status-complete";

  function openFile() {
    if (!file.url) {
      return;
    }

    window.open(
      file.url,
      "_blank",
      "noopener,noreferrer"
    );
  }

  return (
    <div className="file-card-shell">
      <button
        className={
          file.url
            ? "file-card"
            : "file-card file-card-disabled"
        }
        onClick={openFile}
        disabled={!file.url}
      >
        <div className="file-icon">
          {extension || "FILE"}
        </div>

        <div className="file-info">
          <div className="file-name">
            {file.file_name}
          </div>

          <div className="file-meta">
            <span>
              {file.category.toUpperCase()}
            </span>

            {size && (
              <>
                <i>·</i>
                <span>{size}</span>
              </>
            )}
          </div>
        </div>

        <div className="file-open">
          ↗
        </div>
      </button>

      {canAnalyze && (
        <div className="intelligence-panel">
          <div className="intelligence-topline">
            <div>
              <div className="small-label">
                FILE INTELLIGENCE
              </div>

              <div
                className={
                  analysis
                    ? "intelligence-status intelligence-status-complete"
                    : analyzing
                    ? "intelligence-status intelligence-status-processing"
                    : "intelligence-status"
                }
              >
                <span className="intelligence-dot" />

                {analyzing
                  ? "ANALYZING..."
                  : analysis
                  ? "ANALYSIS COMPLETE"
                  : "NOT ANALYZED"}
              </div>
            </div>

            <button
              className="analyze-button"
              onClick={onAnalyze}
              disabled={
                analyzing ||
                analysisLocked
              }
            >
              {analyzing
                ? "ANALYZING..."
                : analysis
                ? "RE-ANALYZE"
                : "ANALYZE ARTWORK"}
            </button>
          </div>

          {analysisError && (
            <div className="analysis-error">
              {analysisError}
            </div>
          )}

          {analysis && (
            <div className="analysis-results">
              <div className="analysis-facts">
                <span>
                  {analysis.format || extension}
                </span>

                {analysis.width_px &&
                  analysis.height_px && (
                    <span>
                      {analysis.width_px.toLocaleString()} ×{" "}
                      {analysis.height_px.toLocaleString()} PX
                    </span>
                  )}

                {analysis.artwork_type && (
                  <span>
                    {analysis.artwork_type.toUpperCase()}
                  </span>
                )}
              </div>

              {analysis.visual_summary && (
                <AnalysisItem
                  label="OBSERVATION"
                  value={analysis.visual_summary}
                />
              )}

              {analysis.possible_concerns && (
                <AnalysisItem
                  label="POSSIBLE CONCERNS"
                  value={analysis.possible_concerns}
                />
              )}

              {analysis.recommended_next_step && (
                <AnalysisItem
                  label="RECOMMENDED NEXT STEP"
                  value={analysis.recommended_next_step}
                />
              )}

              <div className="analysis-disclaimer">
                VISUAL FILE INTELLIGENCE · NOT A FULL
                TECHNICAL PREFLIGHT
              </div>
            </div>
          )}
        </div>
      )}

      {canPreflight && (
        <div className="intelligence-panel preflight-panel">
          <div className="intelligence-topline">
            <div>
              <div className="small-label">
                PRODUCTION PREFLIGHT
              </div>

              <div
                className={
                  preflighting
                    ? "intelligence-status intelligence-status-processing"
                    : preflightStatusClass
                }
              >
                <span className="intelligence-dot" />
                {preflighting
                  ? "PREFLIGHTING..."
                  : preflightDisplayStatus}
              </div>
            </div>

            <button
              className="analyze-button"
              onClick={onPreflight}
              disabled={
                preflighting ||
                preflightLocked
              }
            >
              {preflighting
                ? "PREFLIGHTING..."
                : preflight
                ? "RE-RUN PREFLIGHT"
                : "RUN PREFLIGHT"}
            </button>
          </div>

          {preflightError && (
            <div className="analysis-error">
              {preflightError}
            </div>
          )}

          {preflight && (
            <div className="analysis-results">
              <div className="analysis-facts">
                <span>PDF</span>
                {preflight.page_count != null && (
                  <span>
                    {preflight.page_count}{" "}
                    {preflight.page_count === 1
                      ? "PAGE"
                      : "PAGES"}
                  </span>
                )}
                {preflight.pages?.[0] && (
                  <span>
                    {preflight.pages[0].width_in} ×{" "}
                    {preflight.pages[0].height_in} IN
                  </span>
                )}
              </div>

              {preflight.pages?.[0] && (
                <AnalysisItem
                  label="DOCUMENT"
                  value={`${preflight.pages[0].orientation.toUpperCase()} · ${
                    preflight.consistent_page_size
                      ? "CONSISTENT PAGE SIZE"
                      : "MIXED PAGE SIZES"
                  }`}
                />
              )}

              {preflight.version === "v2.2" && (
                <div className="production-checks">
                  <div className="small-label">
                    PRODUCTION CHECKS
                  </div>

                  <ProductionCheck
                    label="TRIM BOX"
                    state={
                      firstBoxPage?.trim_box_explicit
                        ? "verified"
                        : "unverified"
                    }
                    value={
                      firstBoxPage?.trim_box_explicit
                        ? "DEFINED"
                        : "NOT DEFINED"
                    }
                  />

                  <ProductionCheck
                    label="BLEED"
                    state={
                      firstBleedPage?.status === "verified"
                        ? "verified"
                        : firstBleedPage?.status === "insufficient"
                        ? "warning"
                        : "unverified"
                    }
                    value={
                      firstBleedPage?.status === "verified"
                        ? `${firstBleedPage.minimum_bleed_in} IN MINIMUM`
                        : firstBleedPage?.status === "insufficient"
                        ? "INSUFFICIENT"
                        : "CANNOT VERIFY"
                    }
                  />
                </div>
              )}

              {preflight.observations &&
                preflight.observations.length > 0 && (
                  <AnalysisItem
                    label="OBSERVATIONS"
                    value={preflight.observations.join(" ")}
                  />
                )}

              {preflight.concerns &&
                preflight.concerns.length > 0 && (
                  <AnalysisItem
                    label={
                      hasMeasuredWarning
                        ? "WARNING DETAILS"
                        : "WHY IT'S UNVERIFIED"
                    }
                    value={preflight.concerns.join(" ")}
                  />
                )}

              {preflight.not_verified &&
                preflight.not_verified.length > 0 && (
                  <AnalysisItem
                    label="NOT YET VERIFIED"
                    value={preflight.not_verified.join(" · ")}
                  />
                )}

              {preflight.recommended_next_step && (
                <AnalysisItem
                  label="RECOMMENDED NEXT STEP"
                  value={preflight.recommended_next_step}
                />
              )}

              <div className="analysis-disclaimer">
                PRODUCTION PREFLIGHT · NOT FINAL
                PRODUCTION APPROVAL
              </div>
            </div>
          )}
        </div>
      )}

      {!canAnalyze && !canPreflight && (
        <div className="intelligence-unsupported">
          FILE INTELLIGENCE V1 SUPPORTS JPG, PNG,
          AND WEBP · PRODUCTION PREFLIGHT V2.2
          SUPPORTS PDF
        </div>
      )}
    </div>
  );
}

function ProductionCheck({
  label,
  state,
  value,
}: {
  label: string;
  state: "verified" | "warning" | "unverified";
  value: string;
}) {
  const symbol =
    state === "verified"
      ? "✓"
      : state === "warning"
      ? "!"
      : "○";

  return (
    <div className={`production-check production-check-${state}`}>
      <div className="production-check-name">
        {label}
      </div>

      <div className="production-check-value">
        <span className="production-check-symbol">
          {symbol}
        </span>
        {value}
      </div>
    </div>
  );
}

function AnalysisItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="analysis-item">
      <div className="small-label">
        {label}
      </div>

      <p>{value}</p>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getFileExtension(
  fileName: string
) {
  const parts = fileName.split(".");

  if (parts.length < 2) {
    return "FILE";
  }

  return (
    parts.pop()?.toUpperCase() ||
    "FILE"
  );
}

function formatFileSize(
  bytes: number | null
) {
  if (
    bytes === null ||
    bytes === undefined
  ) {
    return "";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} KB`;
  }

  const megabytes =
    kilobytes / 1024;

  if (megabytes < 1024) {
    return `${megabytes.toFixed(1)} MB`;
  }

  const gigabytes =
    megabytes / 1024;

  return `${gigabytes.toFixed(1)} GB`;
}

function BriefItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="brief-item">
      <div className="small-label">
        {label}
      </div>

      <div className="brief-value">
        {value}
      </div>
    </div>
  );
}

function TimelineStep({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <div className="timeline-step">
      <span
        className={
          active
            ? "timeline-dot active"
            : "timeline-dot"
        }
      />

      <strong
        className={
          active
            ? "timeline-label active-label"
            : "timeline-label"
        }
      >
        {label}
      </strong>
    </div>
  );
}

function TimelineLine() {
  return (
    <div className="timeline-line" />
  );
}

function BabaAvatar({
  large = false,
}: {
  large?: boolean;
}) {
  return (
    <div
      className={
        large
          ? "baba-avatar large"
          : "baba-avatar"
      }
    >
      <span />
      <span />
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| STYLES
|--------------------------------------------------------------------------
*/

const styles = `
  :global(*) {
    box-sizing: border-box;
  }

  :global(html) {
    background: #ffffff;
  }

  :global(body) {
    margin: 0;
    background: #ffffff;
    color: #090909;
    font-family: Arial, Helvetica, sans-serif;
  }

  :global(button),
  :global(input) {
    font: inherit;
  }

  .page {
    width: 100%;
    min-height: 100vh;
    background: #ffffff;
  }

  .loading-screen {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 13px;
    letter-spacing: 0.12em;
  }

  .topbar {
    position: relative;
    height: 155px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 28px;
    border-bottom: 1px solid #e8e8e8;
    background: rgba(255, 255, 255, 0.96);
    z-index: 10;
  }

  .project-header {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    white-space: nowrap;
  }

  .project-number {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  .project-status {
    margin-top: 18px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 9px;
    color: #85858f;
    font-size: 15px;
    letter-spacing: 0.08em;
  }

  .status-dot {
    width: 12px;
    height: 12px;
    display: inline-block;
    border-radius: 50%;
    background: #72e600;
    flex: 0 0 auto;
  }

  .icon-button {
    border: 0;
    background: transparent;
    padding: 10px;
    font-size: 31px;
    line-height: 1;
    cursor: pointer;
  }

  .menu-button {
    letter-spacing: 5px;
    transform: translateY(-5px);
  }

  .content {
    width: min(
      1080px,
      calc(100% - 96px)
    );
    margin: 0 auto;
  }

  .hero {
    padding: 80px 38px 68px;
    border-bottom: 1px solid #e6e6e6;
  }

  .eyebrow,
  .small-label {
    color: #aaaab5;
    letter-spacing: 0.16em;
  }

  .eyebrow {
    font-size: 16px;
  }

  .hero h1 {
    margin: 26px 0 22px;
    font-size: clamp(
      48px,
      7vw,
      82px
    );
    line-height: 0.98;
    font-weight: 400;
    letter-spacing: -0.055em;
  }

  .hero-meta {
    color: #7f7f89;
    font-size: 19px;
    letter-spacing: 0.04em;
  }

  .hero-meta span {
    margin: 0 8px;
  }

  .section {
    padding: 52px 38px;
    border-bottom: 1px solid #e6e6e6;
  }

  /*
  |--------------------------------------------------------------------------
  | STATUS
  |--------------------------------------------------------------------------
  */

  .timeline {
    display: flex;
    align-items: flex-start;
    margin-top: 44px;
  }

  .timeline-step {
    width: 70px;
    flex: 0 0 70px;
    text-align: center;
  }

  .timeline-dot {
    width: 17px;
    height: 17px;
    display: block;
    margin: 0 auto 16px;
    border-radius: 50%;
    border: 1px solid #c8c8cf;
    background: #ffffff;
  }

  .timeline-dot.active {
    border-color: #72e600;
    background: #72e600;
  }

  .timeline-label {
    color: #b1b1b9;
    font-size: 11px;
    letter-spacing: 0.05em;
  }

  .active-label {
    color: #111111;
  }

  .timeline-line {
    height: 1px;
    background: #dedee2;
    flex: 1;
    margin-top: 8px;
  }

  .current-card {
    margin-top: 42px;
    padding: 28px;
    border-radius: 24px;
    background: #f6f6f6;
  }

  .small-label {
    font-size: 12px;
    line-height: 1.4;
  }

  .current-card strong {
    display: block;
    margin-top: 17px;
    font-size: 18px;
    letter-spacing: 0.05em;
  }

  /*
  |--------------------------------------------------------------------------
  | BRIEF
  |--------------------------------------------------------------------------
  */

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .completion {
    color: #9696a0;
    font-size: 11px;
    letter-spacing: 0.08em;
  }

  .brief-grid {
    display: grid;
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
    column-gap: 80px;
    row-gap: 45px;
    margin-top: 48px;
  }

  .brief-item {
    min-width: 0;
  }

  .brief-value {
    margin-top: 12px;
    font-size: 20px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  /*
  |--------------------------------------------------------------------------
  | PROJECT FILES
  |--------------------------------------------------------------------------
  */

  .files-section {
    background: #ffffff;
  }

  .files-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }

  .files-count {
    margin-top: 12px;
    color: #8f8f99;
    font-size: 11px;
    letter-spacing: 0.1em;
  }

  .upload-button {
    min-height: 46px;
    padding: 0 19px;
    border: 0;
    border-radius: 23px;
    background: #000000;
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    cursor: pointer;
  }

  .upload-button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .hidden-file-input {
    display: none;
  }

  .category-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 32px;
  }

  .category-button {
    min-height: 35px;
    padding: 0 14px;
    border: 1px solid #dedee2;
    border-radius: 18px;
    background: #ffffff;
    color: #8d8d96;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    cursor: pointer;
  }

  .category-button-active {
    border-color: #000000;
    background: #000000;
    color: #72e600;
  }

  .category-button:disabled {
    cursor: default;
  }

  .category-help {
    margin-top: 13px;
    color: #aaaab2;
    font-size: 11px;
    line-height: 1.5;
  }

  .category-help strong {
    color: #777780;
  }

  .upload-error {
    margin-top: 22px;
    padding: 15px 17px;
    border: 1px solid #d8d8dc;
    border-radius: 12px;
    background: #f7f7f7;
    font-size: 12px;
    line-height: 1.5;
  }

  .files-loading {
    margin-top: 36px;
    color: #a0a0a8;
    font-size: 11px;
    letter-spacing: 0.12em;
  }

  .empty-files {
    margin-top: 34px;
    min-height: 140px;
    padding: 28px;
    display: flex;
    align-items: center;
    gap: 22px;
    border: 1px dashed #d7d7dc;
    border-radius: 20px;
    background: #fafafa;
  }

  .empty-file-icon {
    width: 50px;
    height: 50px;
    flex: 0 0 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 14px;
    background: #000000;
    color: #72e600;
    font-size: 28px;
    font-weight: 300;
  }

  .empty-files strong {
    font-size: 12px;
    letter-spacing: 0.08em;
  }

  .empty-files p {
    max-width: 440px;
    margin: 9px 0 0;
    color: #96969f;
    font-size: 13px;
    line-height: 1.5;
  }

  .file-list {
    margin-top: 30px;
    display: grid;
    gap: 10px;
  }

  .file-card {
    width: 100%;
    min-width: 0;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 15px;
    border: 1px solid #e1e1e5;
    border-radius: 17px;
    background: #ffffff;
    color: #111111;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      transform 0.15s ease;
  }

  .file-card:hover {
    border-color: #a9a9af;
    transform: translateY(-1px);
  }

  .file-card-disabled {
    cursor: default;
    opacity: 0.65;
  }

  .file-card-disabled:hover {
    border-color: #e1e1e5;
    transform: none;
  }

  .file-icon {
    width: 50px;
    height: 50px;
    flex: 0 0 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 13px;
    background: #f1f1f2;
    color: #222222;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .file-info {
    min-width: 0;
    flex: 1;
  }

  .file-name {
    overflow: hidden;
    color: #111111;
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-meta {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 7px;
    color: #9999a2;
    font-size: 9px;
    letter-spacing: 0.08em;
  }

  .file-meta i {
    font-style: normal;
  }

  .file-open {
    width: 32px;
    flex: 0 0 32px;
    color: #888891;
    font-size: 18px;
    text-align: center;
  }

  .file-card-shell {
    width: 100%;
    min-width: 0;
    border: 1px solid #e1e1e5;
    border-radius: 17px;
    overflow: hidden;
    background: #ffffff;
  }

  .file-card-shell .file-card {
    border: 0;
    border-radius: 0;
  }

  .file-card-shell .file-card:hover {
    border-color: transparent;
  }

  .intelligence-panel {
    padding: 18px 16px 19px;
    border-top: 1px solid #ededf0;
    background: #fafafa;
  }

  .intelligence-topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }

  .intelligence-status {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 7px;
    color: #96969f;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.09em;
  }

  .intelligence-dot {
    width: 7px;
    height: 7px;
    flex: 0 0 7px;
    border-radius: 50%;
    background: #bdbdc3;
  }

  .intelligence-status-processing {
    color: #777780;
  }

  .intelligence-status-processing .intelligence-dot {
    background: #111111;
    animation: pulse 1s infinite ease-in-out;
  }

  .intelligence-status-complete {
    color: #60c900;
  }

  .intelligence-status-complete .intelligence-dot {
    background: #72e600;
  }

  .analyze-button {
    min-height: 38px;
    padding: 0 15px;
    border: 1px solid #111111;
    border-radius: 20px;
    background: #ffffff;
    color: #111111;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    cursor: pointer;
  }

  .analyze-button:hover:not(:disabled) {
    background: #000000;
    color: #72e600;
  }

  .analyze-button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .analysis-error {
    margin-top: 15px;
    padding: 12px 14px;
    border: 1px solid #dedee2;
    border-radius: 11px;
    background: #ffffff;
    color: #55555d;
    font-size: 11px;
    line-height: 1.45;
  }

  .analysis-results {
    margin-top: 18px;
    padding-top: 18px;
    border-top: 1px solid #e3e3e6;
  }

  .analysis-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .analysis-facts span {
    padding: 7px 9px;
    border-radius: 8px;
    background: #eeeeef;
    color: #6f6f77;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.07em;
  }

  .analysis-item {
    margin-top: 20px;
  }

  .analysis-item p {
    margin: 8px 0 0;
    color: #3d3d42;
    font-size: 12px;
    line-height: 1.55;
  }

  .analysis-disclaimer {
    margin-top: 20px;
    color: #aaaab2;
    font-size: 8px;
    line-height: 1.5;
    letter-spacing: 0.09em;
  }

  .preflight-panel {
    background: #fafafa;
  }

  .preflight-status-unverified {
    color: #777780;
  }

  .preflight-status-unverified .intelligence-dot {
    border: 1px solid #777780;
    background: transparent;
  }

  .preflight-status-warning {
    color: #111111;
  }

  .preflight-status-warning .intelligence-dot {
    border-radius: 0;
    background: #111111;
    transform: rotate(45deg);
  }

  .production-checks {
    margin-top: 21px;
    padding-top: 19px;
    border-top: 1px solid #e7e7ea;
  }

  .production-check {
    margin-top: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }

  .production-check-name {
    color: #777780;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .production-check-value {
    display: flex;
    align-items: center;
    gap: 7px;
    color: #777780;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-align: right;
  }

  .production-check-symbol {
    width: 14px;
    display: inline-flex;
    justify-content: center;
    color: #777780;
    font-size: 12px;
  }

  .production-check-verified .production-check-value,
  .production-check-verified .production-check-symbol {
    color: #111111;
  }

  .production-check-warning .production-check-value,
  .production-check-warning .production-check-symbol {
    color: #111111;
  }

  .intelligence-unsupported {
    padding: 13px 16px;
    border-top: 1px solid #ededf0;
    background: #fafafa;
    color: #aaaab2;
    font-size: 8px;
    letter-spacing: 0.08em;
  }

  /*
  |--------------------------------------------------------------------------
  | BABA
  |--------------------------------------------------------------------------
  */

  .baba-section {
    margin: 0 28px;
    padding: 50px 38px 70px;
    background: #fcfcfc;
  }

  .baba-section-complete {
    border-top: 2px solid #72e600;
  }

  .baba-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  .baba-online {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-top: 16px;
    color: #60c900;
    font-size: 13px;
    letter-spacing: 0.12em;
  }

  .baba-online .status-dot {
    width: 11px;
    height: 11px;
  }

  .baba-mode {
    margin-top: 30px;
    padding: 15px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: 1px solid #e5e5e5;
    border-radius: 14px;
    color: #92929b;
    font-size: 10px;
    letter-spacing: 0.12em;
  }

  .baba-mode span {
    color: #60c900;
  }

  .baba-avatar {
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    border-radius: 12px;
    background: #000000;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }

  .baba-avatar.large {
    width: 60px;
    height: 60px;
    flex-basis: 60px;
    border-radius: 17px;
    gap: 5px;
  }

  .baba-avatar span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #72e600;
  }

  .baba-avatar.large span {
    width: 12px;
    height: 12px;
  }

  .conversation {
    margin-top: 34px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .history-loading {
    padding: 20px 0;
    color: #a0a0a8;
    font-size: 11px;
    letter-spacing: 0.12em;
  }

  .message-row {
    display: flex;
    width: 100%;
    min-width: 0;
  }

  .baba-row {
    align-items: flex-end;
    gap: 14px;
    justify-content: flex-start;
  }

  .user-row {
    justify-content: flex-end;
  }

  .message {
    font-size: 18px;
    line-height: 1.45;
    overflow-wrap: break-word;
  }

  .baba-message {
    width: auto;
    max-width: min(
      720px,
      calc(100% - 54px)
    );
    padding: 20px 24px;
    border: 1px solid #dedee2;
    border-radius:
      24px 24px 24px 5px;
    background: #ffffff;
  }

  .user-message {
    width: auto;
    max-width: 72%;
    padding: 18px 23px;
    border-radius:
      24px 24px 5px 24px;
    background: #000000;
    color: #ffffff;
  }

  .thinking {
    min-width: 76px;
    height: 48px;
    padding: 0 20px;
    border: 1px solid #dedee2;
    border-radius:
      22px 22px 22px 5px;
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
  }

  .thinking span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #72e600;
    animation:
      pulse 1s infinite ease-in-out;
  }

  .thinking span:nth-child(2) {
    animation-delay: 0.15s;
  }

  .thinking span:nth-child(3) {
    animation-delay: 0.3s;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.25;
    }

    50% {
      opacity: 1;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | COMPOSER
  |--------------------------------------------------------------------------
  */

  .input-spacer {
    height: 205px;
  }

  .composer-shell {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 100;
    padding:
      14px
      max(
        24px,
        calc(
          (100vw - 1080px) / 2 +
            52px
        )
      )
      calc(
        14px +
          env(safe-area-inset-bottom)
      );
    background:
      rgba(255, 255, 255, 0.94);
    border-top: 1px solid #ededed;
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter:
      blur(18px);
  }

  .composer-inner {
    display: flex;
    align-items: center;
    width: 100%;
  }

  .composer {
    flex: 1;
    min-width: 0;
    height: 72px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 9px 8px 24px;
    border: 1px solid #d9d9de;
    border-radius: 38px;
    background: #ffffff;
    box-shadow:
      0 6px 28px
      rgba(0, 0, 0, 0.04);
  }

  .composer input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: none;
    background: transparent;
    color: #111111;
    font-size: 18px;
  }

  .composer input::placeholder {
    color: #aaaab0;
  }

  .send-button {
    width: 55px;
    height: 55px;
    flex: 0 0 55px;
    border: 0;
    border-radius: 50%;
    background: #000000;
    color: #72e600;
    font-size: 27px;
    line-height: 1;
    cursor: pointer;
  }

  .send-button:disabled {
    background: #d2d2d2;
    color: #ffffff;
    cursor: default;
  }

  /*
  |--------------------------------------------------------------------------
  | MOBILE
  |--------------------------------------------------------------------------
  */

  @media (max-width: 700px) {
    .topbar {
      height: 105px;
      padding: 0 16px;
    }

    .project-number {
      font-size: 17px;
    }

    .project-status {
      margin-top: 9px;
      font-size: 12px;
    }

    .project-status .status-dot {
      width: 9px;
      height: 9px;
    }

    .icon-button {
      font-size: 27px;
    }

    .content {
      width: 100%;
      margin: 0;
    }

    .hero {
      padding:
        42px 28px 38px;
    }

    .eyebrow {
      font-size: 13px;
    }

    .hero h1 {
      margin-top: 18px;
      margin-bottom: 15px;
      font-size: 47px;
    }

    .hero-meta {
      font-size: 15px;
    }

    .status-section {
      padding-top: 38px;
      padding-bottom: 38px;
    }

    .section {
      padding-left: 28px;
      padding-right: 28px;
    }

    .timeline {
      margin-top: 30px;
    }

    .timeline-step {
      width: 52px;
      flex-basis: 52px;
    }

    .timeline-dot {
      width: 14px;
      height: 14px;
      margin-bottom: 13px;
    }

    .timeline-label {
      font-size: 9px;
    }

    .timeline-line {
      margin-top: 6px;
    }

    .current-card {
      margin-top: 28px;
      padding: 22px;
      border-radius: 20px;
    }

    .current-card strong {
      margin-top: 13px;
      font-size: 17px;
    }

    .brief-section {
      padding-top: 38px;
      padding-bottom: 40px;
    }

    .brief-grid {
      column-gap: 34px;
      row-gap: 34px;
      margin-top: 36px;
    }

    .brief-value {
      font-size: 17px;
      line-height: 1.4;
    }

    /*
    | FILES MOBILE
    */

    .files-section {
      padding-top: 38px;
      padding-bottom: 42px;
    }

    .files-heading {
      align-items: flex-start;
    }

    .upload-button {
      min-height: 42px;
      padding: 0 15px;
      font-size: 9px;
    }

    .category-row {
      margin-top: 26px;
      gap: 7px;
    }

    .category-button {
      min-height: 32px;
      padding: 0 11px;
      font-size: 8px;
    }

    .empty-files {
      margin-top: 28px;
      min-height: 120px;
      padding: 22px;
      gap: 16px;
    }

    .empty-file-icon {
      width: 44px;
      height: 44px;
      flex-basis: 44px;
      border-radius: 12px;
      font-size: 24px;
    }

    .empty-files p {
      font-size: 12px;
    }

    .file-list {
      margin-top: 26px;
    }

    .file-card {
      padding: 13px;
      gap: 12px;
      border-radius: 15px;
    }

    .file-icon {
      width: 44px;
      height: 44px;
      flex-basis: 44px;
      border-radius: 11px;
      font-size: 9px;
    }

    .file-name {
      font-size: 13px;
    }

    .file-meta {
      margin-top: 7px;
      font-size: 8px;
    }

    .file-card-shell {
      border-radius: 15px;
    }

    .intelligence-panel {
      padding: 16px 13px 17px;
    }

    .intelligence-topline {
      align-items: flex-start;
      gap: 12px;
    }

    .analyze-button {
      min-height: 35px;
      padding: 0 11px;
      font-size: 8px;
    }

    .analysis-item p {
      font-size: 11px;
    }

    /*
    | BABA MOBILE
    */

    .baba-section {
      margin: 0;
      padding:
        34px 20px 48px;
      border-top:
        1px solid #ededed;
    }

    .baba-section-complete {
      border-top:
        2px solid #72e600;
    }

    .baba-heading {
      padding: 0 8px;
    }

    .baba-mode {
      margin-top: 24px;
    }

    .baba-avatar.large {
      width: 54px;
      height: 54px;
      flex-basis: 54px;
      border-radius: 16px;
    }

    .conversation {
      margin-top: 28px;
      gap: 18px;
    }

    .baba-row {
      gap: 10px;
      align-items: flex-end;
    }

    .baba-avatar {
      width: 34px;
      height: 34px;
      flex-basis: 34px;
      border-radius: 10px;
    }

    .baba-avatar span {
      width: 7px;
      height: 7px;
    }

    .message {
      font-size: 16px;
      line-height: 1.42;
    }

    .baba-message {
      max-width:
        calc(100% - 44px);
      padding: 17px 18px;
      border-radius:
        20px 20px 20px 5px;
    }

    .user-message {
      max-width: 82%;
      padding: 16px 18px;
      border-radius:
        20px 20px 5px 20px;
    }

    .input-spacer {
      height: 180px;
    }

    .composer-shell {
      padding:
        10px
        14px
        calc(
          10px +
            env(
              safe-area-inset-bottom
            )
        );
    }

    .composer-inner {
      width: 100%;
    }

    .composer {
      height: 62px;
      padding-left: 18px;
      border-radius: 32px;
    }

    .composer input {
      font-size: 16px;
    }

    .send-button {
      width: 47px;
      height: 47px;
      flex-basis: 47px;
      font-size: 23px;
    }
  }

  @media (max-width: 390px) {
    .hero {
      padding-left: 22px;
      padding-right: 22px;
    }

    .section {
      padding-left: 22px;
      padding-right: 22px;
    }

    .hero h1 {
      font-size: 42px;
    }

    .brief-grid {
      column-gap: 24px;
    }

    .files-heading {
      gap: 12px;
    }

    .upload-button {
      padding: 0 12px;
    }

    .category-button {
      padding: 0 9px;
    }

    .baba-section {
      padding-left: 14px;
      padding-right: 14px;
    }

    .user-message {
      max-width: 86%;
    }

    .composer-shell {
      padding-left: 10px;
      padding-right: 10px;
    }

    .composer {
      padding-left: 15px;
    }
  }
`;
