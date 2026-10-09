import Link from "next/link";
import { ArrowIcon } from "../updates/Icons";
import { factoryNextFor } from "../../lib/factoryWork";
import { projectStatusLabel } from "../admin/statuses";

export type FactoryProject = {
  id: string;
  project_number: string;
  title: string | null;
  request: string | null;
  product_type: string | null;
  quantity: number | null;
  status: string | null;
  created_at: string;
};

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function projectName(project: Pick<FactoryProject, "title" | "request">) {
  const name = project.title?.trim() || project.request?.trim() || "Untitled project";
  return name.length > 70 ? `${name.slice(0, 67)}…` : name;
}

/* One assigned project: what it is, where it stands and what is on the factory. */
export function FactoryProjectCard({ project }: { project: FactoryProject }) {
  const next = factoryNextFor(project.status);
  const needsYou = next.tone === "action";
  const meta = [
    project.project_number,
    project.product_type?.trim(),
    project.quantity ? `${project.quantity.toLocaleString("en-US")} pcs` : null,
    formatDate(project.created_at),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      className={`rounded-[24px] border-2 p-4 sm:p-5 ${
        needsYou ? "border-black bg-[var(--dcl-lime-soft)]" : "border-zinc-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-[18px] font-black leading-tight tracking-[-0.03em]">{projectName(project)}</h3>
          <p className="mt-1 text-[13px] font-medium text-zinc-600">{meta}</p>
        </div>
        <span className="shrink-0 rounded-full border-2 border-black bg-white px-3 py-1 text-[12px] font-extrabold">
          {projectStatusLabel(project.status || "development")}
        </span>
      </div>

      <div className="mt-3">
        <p className="text-[15px] font-extrabold">{next.headline}</p>
        <p className="mt-0.5 text-[14px] leading-snug text-zinc-700">{next.detail}</p>
      </div>

      <Link
        href={`/factory/projects/${encodeURIComponent(project.project_number)}`}
        className={`group mt-4 flex min-h-[52px] items-center justify-between rounded-full border-[3px] border-black px-5 text-[15px] font-extrabold transition active:scale-[0.98] ${
          needsYou ? "bg-[var(--dcl-lime)] text-black" : "bg-white text-black hover:bg-black hover:text-white"
        }`}
      >
        {next.cta ?? "Open project"}
        <ArrowIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
      </Link>
    </li>
  );
}
