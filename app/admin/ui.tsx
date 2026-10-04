import Link from "next/link";
import type { ReactNode } from "react";

/* Shared building blocks for the team workspace. Simple on purpose (client
   feedback): white cards, light grey borders, black buttons, no accents. */

export const FIELD =
  "mt-1.5 h-11 w-full rounded-xl border-2 border-zinc-200 bg-white px-3 text-[14px] text-zinc-900 outline-none transition hover:border-zinc-300 focus:border-black";
export const TEXTAREA =
  "mt-1.5 w-full rounded-xl border-2 border-zinc-200 bg-white px-3 py-2.5 text-[14px] leading-relaxed text-zinc-900 outline-none transition hover:border-zinc-300 focus:border-black";
export const LABEL = "block text-[12px] font-bold uppercase tracking-[0.08em] text-zinc-600";
export const BTN =
  "inline-flex h-11 items-center justify-center rounded-full bg-[#0a0a0a] px-5 text-[14px] font-extrabold text-white transition hover:bg-zinc-800 disabled:opacity-50";
export const BTN_GHOST =
  "inline-flex h-11 items-center justify-center rounded-full border-2 border-zinc-300 bg-white px-5 text-[14px] font-extrabold text-black transition hover:border-black";
export const BTN_DANGER =
  "inline-flex h-11 items-center justify-center rounded-full bg-red-600 px-5 text-[14px] font-extrabold text-white transition hover:bg-red-700";

export type SearchParams = Record<string, string | string[] | undefined>;

export function param(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* "+16465550100" → "(646) 555-0100"; other countries stay E.164. */
export function formatPhone(e164: string) {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return us ? `(${us[1]}) ${us[2]}-${us[3]}` : e164;
}

/* Text for a Supabase ilike filter: drop the characters PostgREST treats as
   syntax so a search box can't change the query. */
export function cleanSearch(value: string) {
  return value.replace(/[%,()*\\]/g, " ").trim().slice(0, 80);
}

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/requests", label: "Requests" },
  { href: "/admin/projects", label: "Projects" },
  { href: "/admin/factories", label: "Factories" },
];

export function AdminTabs({ active, isAdmin }: { active: string; isAdmin: boolean }) {
  const tabs = isAdmin ? [...TABS, { href: "/admin/accounts", label: "Accounts" }] : TABS;
  return (
    <nav aria-label="Team workspace" className="mt-6 flex gap-1 overflow-x-auto rounded-full bg-zinc-100 p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={active === tab.href ? "page" : undefined}
          className={`shrink-0 rounded-full px-4 py-2 text-[14px] font-extrabold transition ${
            active === tab.href ? "bg-white text-black shadow-sm" : "text-zinc-600 hover:text-black"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export function Panel({
  title,
  intro,
  action,
  footer,
  children,
}: {
  title: string;
  intro?: string;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border-2 border-zinc-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[20px] font-black tracking-[-0.03em] sm:text-[22px]">{title}</h2>
          {intro && <p className="mt-1 text-[14px] text-zinc-600">{intro}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
      {footer && <div className="mt-3 text-[13px] font-semibold text-zinc-500">{footer}</div>}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-zinc-50 px-4 py-5 text-[14px] text-zinc-600">{children}</p>;
}

/* ?ok= / ?error= from a server action, turned into one inline message. */
export function Banner({ params, copy }: { params: SearchParams; copy: Record<string, string> }) {
  const ok = param(params, "ok");
  const error = param(params, "error");
  const key = error || ok;
  if (!key) return null;
  const text = copy[key] ?? (error ? "Something went wrong. Please try again." : "Saved.");
  return (
    <p
      role={error ? "alert" : "status"}
      className={`mt-6 rounded-2xl border-2 px-4 py-3 text-[14px] font-semibold ${
        error ? "border-red-200 bg-red-50 text-red-700" : "border-zinc-200 bg-zinc-50 text-zinc-800"
      }`}
    >
      {text}
    </p>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-zinc-100 px-3 py-1 text-[12px] font-bold capitalize text-zinc-700">
      {children}
    </span>
  );
}

/* Prev / next links that keep the current filters. */
export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params: SearchParams;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (target: number) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && value && !["page", "ok", "error", "confirm"].includes(key)) qs.set(key, value);
    }
    if (target > 1) qs.set("page", String(target));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-[14px] font-bold">
      {page > 1 ? (
        <Link href={href(page - 1)} className={BTN_GHOST}>
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-zinc-600">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className={BTN_GHOST}>
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function readPage(params: SearchParams) {
  const n = Number.parseInt(param(params, "page"), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : 1;
}
