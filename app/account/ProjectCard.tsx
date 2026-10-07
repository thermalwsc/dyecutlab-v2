import Link from "next/link";
import { ArrowIcon } from "../updates/Icons";
import { START_PROJECT_HREF } from "../../lib/contact";
import { JOURNEY_STEPS, REQUEST_STEPS, journeyStepIndex, nextStepFor, requestInfoFor } from "../../lib/projectJourney";
import { projectStatusLabel } from "../admin/statuses";
export type ProjectRow = {
  id: string;
  project_number: string;
  title: string | null;
  request: string | null;
  product_type: string | null;
  quantity: number | null;
  status: string | null;
  created_at: string;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function projectName(project: ProjectRow) {
  const name = project.title?.trim() || project.request?.trim() || "Untitled project";
  return name.length > 70 ? `${name.slice(0, 67)}…` : name;
}

function projectMeta(project: ProjectRow) {
  return [
    project.project_number,
    project.product_type?.trim(),
    project.quantity ? `${project.quantity.toLocaleString("en-US")} pcs` : null,
    formatDate(project.created_at),
  ]
    .filter(Boolean)
    .join(" · ");
}

/* Five segments, one per journey step: done = black, current = lime, ahead = grey. */
function JourneyBar({ status }: { status: string | null }) {
  const current = journeyStepIndex(status);
  const delivered = (status || "").toLowerCase() === "delivered";
  return (
    <div>
      <div
        role="img"
        aria-label={`Step ${current + 1} of ${JOURNEY_STEPS.length}: ${JOURNEY_STEPS[current].label}`}
        className="grid grid-cols-5 gap-1.5"
      >
        {JOURNEY_STEPS.map((step, index) => (
          <span
            key={step.label}
            className={`h-2.5 rounded-full ${
              index < current || delivered
                ? "bg-black"
                : index === current
                  ? "bg-[var(--dcl-lime)] ring-2 ring-black"
                  : "bg-zinc-200"
            }`}
          />
        ))}
      </div>
      <div className="mt-1.5 hidden grid-cols-5 gap-1.5 text-[11px] font-bold text-zinc-500 sm:grid">
        {JOURNEY_STEPS.map((step, index) => (
          <span key={step.label} className={index === current ? "text-black" : ""}>
            {step.label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[13px] font-extrabold sm:hidden">
        Step {current + 1} of {JOURNEY_STEPS.length} · {JOURNEY_STEPS[current].label}
      </p>
    </div>
  );
}

export function ProjectCard({ project }: { project: ProjectRow }) {
  const next = nextStepFor(project.status);
  const href = `/project/${encodeURIComponent(project.project_number)}`;
  const needsYou = next.tone === "action";

  return (
    <li
      className={`rounded-[24px] border-2 p-4 sm:p-5 ${
        needsYou ? "border-black bg-[var(--dcl-lime-soft)]" : "border-zinc-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-[18px] font-black leading-tight tracking-[-0.03em]">{projectName(project)}</h3>
          <p className="mt-1 text-[13px] font-medium text-zinc-600">{projectMeta(project)}</p>
        </div>
        <span className="shrink-0 rounded-full border-2 border-black bg-white px-3 py-1 text-[12px] font-extrabold">
          {projectStatusLabel(project.status || "development")}
        </span>
      </div>

      <div className="mt-4">
        <JourneyBar status={project.status} />
      </div>

      <div className="mt-4">
        <p className="text-[15px] font-extrabold">{next.headline}</p>
        <p className="mt-0.5 text-[14px] leading-snug text-zinc-700">{next.detail}</p>
      </div>

      <Link
        href={href}
        className={`group mt-4 flex min-h-[52px] items-center justify-between rounded-full border-[3px] border-black px-5 text-[15px] font-extrabold transition active:scale-[0.98] ${
          needsYou ? "bg-[var(--dcl-lime)] text-black" : "bg-white text-black hover:bg-black hover:text-white"
        }`}
      >
        {next.cta ?? "Open project"}
        <ArrowIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
      </Link>
      {next.tone === "done" && (
        <p className="mt-3 text-center">
          <Link href={START_PROJECT_HREF} className="text-[14px] font-extrabold underline decoration-2 underline-offset-4">
            Start a similar project
          </Link>
        </p>
      )}
    </li>
  );
}


/* ---------------------------------------------------------------- requests */

export type RequestRow = {
  id: string;
  description: string;
  status: string | null;
  created_at: string;
};

function requestTitle(request: RequestRow) {
  const line = request.description.trim().split(/\n/)[0];
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}

/* A request the customer sent that the team hasn't turned into a project yet. */
export function RequestCard({ request }: { request: RequestRow }) {
  const info = requestInfoFor(request.status);
  const closed = info.step === -1;

  return (
    <li className="rounded-[24px] border-2 border-zinc-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-[17px] font-black leading-tight tracking-[-0.03em]">{requestTitle(request)}</h3>
          <p className="mt-1 text-[13px] font-medium text-zinc-600">Sent {formatDate(request.created_at)}</p>
        </div>
        <span className="shrink-0 rounded-full border-2 border-black bg-white px-3 py-1 text-[12px] font-extrabold">
          {info.label}
        </span>
      </div>

      {!closed && (
        <div className="mt-4">
          <div
            role="img"
            aria-label={`Step ${info.step + 1} of ${REQUEST_STEPS.length}: ${REQUEST_STEPS[info.step]}`}
            className="grid grid-cols-4 gap-1.5"
          >
            {REQUEST_STEPS.map((step, index) => (
              <span
                key={step}
                className={`h-2.5 rounded-full ${
                  index < info.step
                    ? "bg-black"
                    : index === info.step
                      ? "bg-[var(--dcl-lime)] ring-2 ring-black"
                      : "bg-zinc-200"
                }`}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[13px] font-extrabold">
            Step {info.step + 1} of {REQUEST_STEPS.length} · {REQUEST_STEPS[info.step]}
          </p>
        </div>
      )}

      <div className="mt-4">
        <p className="text-[15px] font-extrabold">{info.headline}</p>
        <p className="mt-0.5 text-[14px] leading-snug text-zinc-700">{info.detail}</p>
      </div>
    </li>
  );
}
