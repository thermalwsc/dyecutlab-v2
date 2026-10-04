import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_LABELS } from "../../lib/auth/roles";
import { requireRole } from "../../lib/auth/guard";
import { getServerSupabase } from "../../lib/supabase/server";
import { ArrowIcon } from "../updates/Icons";
import { RoleShell } from "../updates/RoleShell";
import { AdminTabs } from "./ui";
import { projectStatusLabel } from "./statuses";
import StatusSelect from "./StatusSelect";
import { QUOTE_STATUSES, type QuoteStatus } from "./statuses";

export const metadata: Metadata = {
  title: "Team workspace — DYE CUT LAB",
  robots: { index: false },
};

/* Team workspace for dcl_staff and dcl_admin. Kept deliberately simple (client
   feedback): plain cards, no accents. Every read goes through the signed-in
   user's own client, so RLS decides what shows up — the team sees all
   projects and, after 20261001000000_team_reads_requests.sql, all quote
   requests and sign-ups. */

const LIST_LIMIT = 5;

type QuoteRow = { id: string; description: string; phone: string; status: string; created_at: string };
type ProjectRow = {
  id: string;
  project_number: string;
  title: string;
  status: string;
  created_at: string;
  owner_id: string | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* "+16465550100" → "(646) 555-0100"; other countries stay E.164. */
function formatPhone(e164: string) {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return us ? `(${us[1]}) ${us[2]}-${us[3]}` : e164;
}

function asStatus(value: string): QuoteStatus {
  return (QUOTE_STATUSES as readonly string[]).includes(value) ? (value as QuoteStatus) : "new";
}

export default async function AdminPage() {
  const { user, profile, role } = await requireRole(["dcl_staff", "dcl_admin"], { next: "/admin" });
  const supabase = await getServerSupabase();

  const name = profile?.full_name || user.email || "there";
  const isAdmin = role === "dcl_admin";

  const [quotes, newQuotes, projects, signups] = await Promise.all([
    supabase
      .from("quote_requests")
      .select("id, description, phone, status, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT),
    supabase.from("quote_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase
      .from("projects")
      .select("id, project_number, title, status, created_at, owner_id", { count: "exact" })
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT),
    supabase.from("subscribers").select("id", { count: "exact", head: true }),
  ]);

  /* The request/sign-up tables need the team-read migration; until it runs
     those reads are refused, and the page says so instead of showing zeros. */
  const requestsLocked = Boolean(quotes.error);
  if (quotes.error) console.error("ADMIN QUOTES READ:", quotes.error.message);
  if (projects.error) console.error("ADMIN PROJECTS READ:", projects.error.message);

  const quoteRows = (quotes.data ?? []) as QuoteRow[];
  const projectRows = (projects.data ?? []) as ProjectRow[];

  const stats = [
    { label: "New requests", value: requestsLocked ? "—" : newQuotes.count ?? 0 },
    { label: "All requests", value: requestsLocked ? "—" : quotes.count ?? 0 },
    { label: "Projects", value: projects.count ?? 0 },
    { label: "Beta sign-ups", value: signups.error ? "—" : signups.count ?? 0 },
  ];

  return (
    <RoleShell badge={ROLE_LABELS[role]} title={<>Team workspace.</>} intro={`Signed in as ${name}.`}>
      <AdminTabs active="/admin" isAdmin={isAdmin} />
      {/* At a glance */}
      <ul className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {stats.map((stat) => (
          <li key={stat.label} className="rounded-2xl border-2 border-zinc-200 bg-white px-5 py-4">
            <p className="text-[clamp(28px,7vw,40px)] font-black leading-none tracking-[-0.04em] tabular-nums">
              {stat.value}
            </p>
            <p className="mt-2 text-[14px] font-bold text-zinc-600">{stat.label}</p>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* Quote requests from /start */}
        <Panel
          title="Quote requests"
          intro="Requests from the website. Update the status as you follow up."
          footer={
            !requestsLocked && (
              <Link href="/admin/requests" className="font-bold text-black underline underline-offset-2">
                View all {quotes.count ?? 0} requests →
              </Link>
            )
          }
        >
          {requestsLocked ? (
            <Empty>
              Requests can&rsquo;t be shown yet. Run the migration{" "}
              <code className="font-bold">20261001000000_team_reads_requests.sql</code> in Supabase.
            </Empty>
          ) : quoteRows.length === 0 ? (
            <Empty>No requests yet. New ones from the website will appear here.</Empty>
          ) : (
            <ul className="divide-y divide-zinc-200">
              {quoteRows.map((quote) => (
                <li key={quote.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/admin/requests/${quote.id}`} className="line-clamp-2 text-[15px] font-bold leading-snug hover:underline">{quote.description}</Link>
                    <p className="mt-1 text-[13px] text-zinc-600">
                      <a href={`sms:${quote.phone}`} className="font-bold text-black underline underline-offset-2">
                        {formatPhone(quote.phone)}
                      </a>{" "}
                      · {formatDate(quote.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <StatusSelect id={quote.id} status={asStatus(quote.status)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Projects (all of them — the team role sees every project) */}
        <Panel
          title="Projects"
          intro="Every project, newest first."
          footer={
            <Link href="/admin/projects" className="font-bold text-black underline underline-offset-2">
              View all {projects.count ?? 0} projects →
            </Link>
          }
        >
          {projectRows.length === 0 ? (
            <Empty>No projects yet.</Empty>
          ) : (
            <ul className="divide-y divide-zinc-200">
              {projectRows.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/admin/projects/${project.id}`}
                    className="group flex items-center justify-between gap-3 py-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-bold">{project.title}</p>
                      <p className="mt-1 text-[13px] text-zinc-600">
                        <span className="font-bold text-black">{project.project_number}</span> ·{" "}
                        {formatDate(project.created_at)}
                        {!project.owner_id && <> · Not linked to a customer</>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-[12px] font-bold capitalize text-zinc-700">
                        {projectStatusLabel(project.status)}
                      </span>
                      <ArrowIcon className="h-4 w-4 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-black" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Accounts */}
      <div className="mt-6 flex flex-col gap-4 rounded-2xl border-2 border-zinc-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="text-[20px] font-black tracking-[-0.03em]">Accounts</h2>
          <p className="mt-1 text-[14px] text-zinc-600">
            {isAdmin
              ? "Invite team members and factory users, change roles, and switch accounts on or off."
              : "Inviting people and changing roles is done by a DCL admin."}
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/admin/accounts"
            className="group flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#0a0a0a] px-6 text-[15px] font-extrabold text-white transition hover:bg-zinc-800"
          >
            Manage accounts
            <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        )}
      </div>
    </RoleShell>
  );
}

function Panel({
  title,
  intro,
  footer,
  children,
}: {
  title: string;
  intro: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border-2 border-zinc-200 bg-white p-5 sm:p-6">
      <h2 className="text-[22px] font-black tracking-[-0.03em]">{title}</h2>
      <p className="mt-1 text-[14px] text-zinc-600">{intro}</p>
      <div className="mt-3">{children}</div>
      {footer && <div className="mt-3 text-[13px] font-semibold text-zinc-500">{footer}</div>}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-zinc-50 px-4 py-5 text-[14px] text-zinc-600">{children}</p>;
}
