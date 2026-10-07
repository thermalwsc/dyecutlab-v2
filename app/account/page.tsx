import type { Metadata } from "next";
import Link from "next/link";
import { brandFont } from "../fonts";
import { Footer, Header } from "../updates/SiteChrome";
import { ArrowIcon, Burst, ChatDotsIcon } from "../updates/Icons";
import { CONTACT, START_PROJECT_HREF } from "../../lib/contact";
import { nextStepFor } from "../../lib/projectJourney";
import { ROLE_LABELS } from "../../lib/auth/roles";
import { requireRole } from "../../lib/auth/guard";
import { getServerSupabase } from "../../lib/supabase/server";
import { getServiceRoleSupabase, isServiceRoleConfigured } from "../../lib/supabase/admin";
import { ProjectCard, RequestCard, projectName, type ProjectRow, type RequestRow } from "./ProjectCard";

export const metadata: Metadata = {
  title: "My projects — DYE CUT LAB",
  robots: { index: false },
};

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  email: "email + password",
};

export default async function AccountPage() {
  /* The guard is the only way in: the session is verified with the Auth server,
     a switched-off account is signed out, and staff or factory accounts are sent
     to their own area instead of this one. */
  const { viewer, user, profile, role } = await requireRole(["customer"], { next: "/account" });

  const name: string = profile?.full_name || user.email?.split("@")[0] || "there";
  const firstName = name.split(" ")[0];
  const provider = PROVIDER_LABEL[user.provider ?? ""] ?? "email + password";

  /* Row Level Security already limits this to the customer's own projects. */
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select("id, project_number, title, request, product_type, quantity, status, created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) console.error("ACCOUNT PROJECTS:", error.message);

  /* Requests the customer sent from /start that the team hasn't turned into a
     project yet. Customers can't read quote_requests directly (it holds the
     team's private notes), so this is read on the server, filtered to the
     verified account (user.id comes from the checked session) and limited to
     safe columns. Once a request becomes a project, the project card takes over. */
  let requests: RequestRow[] = [];
  if (isServiceRoleConfigured()) {
    const { data: requestData, error: requestError } = await getServiceRoleSupabase()
      .from("quote_requests")
      .select("id, description, status, created_at")
      .eq("user_id", user.id)
      .is("project_id", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (requestError) console.error("ACCOUNT REQUESTS:", requestError.message);
    requests = (requestData ?? []) as RequestRow[];
  }

  const projects = (data ?? []) as ProjectRow[];
  const delivered = projects.filter((p) => (p.status || "").toLowerCase() === "delivered");
  const active = projects.filter((p) => (p.status || "").toLowerCase() !== "delivered");
  const needsYou = active.filter((p) => nextStepFor(p.status).tone === "action");
  const smsHref = `sms:${CONTACT.phoneE164}`;

  return (
    <div className={`${brandFont.className} dcl-landing`}>
      <main className="min-h-screen overflow-x-hidden bg-white text-[#0a0a0a] antialiased">
        <Header />

        <section className="mx-auto w-full max-w-3xl px-4 pb-14 pt-8 sm:px-6 sm:pt-12">
          <h1 className="dcl-rise text-[clamp(36px,9.4vw,60px)] font-black leading-[1.02] tracking-[-0.045em]">
            Hi,{" "}
            <span className="relative inline-block max-w-full">
              <span className="relative z-10 inline-block max-w-full -rotate-2 truncate rounded-[0.35em] bg-[var(--dcl-lime)] px-[0.16em] pb-[0.05em] align-bottom">
                {firstName}.
              </span>
              <Burst className="absolute -right-[0.5em] -top-[0.45em] h-[0.55em] w-[0.55em] text-[var(--dcl-lime-deep)]" />
            </span>
          </h1>
          <p className="mt-3 text-[16px] font-medium text-zinc-700">
            {projects.length === 0 && requests.length > 0
              ? "We've got your request. Here's where it stands."
              : projects.length === 0
              ? "Ready when you are. Tell us what you want to make."
              : needsYou.length > 0
                ? `${needsYou.length === 1 ? "One project needs" : `${needsYou.length} projects need`} your attention.`
                : "Here's where your projects stand."}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href={START_PROJECT_HREF}
              className="group flex min-h-[60px] items-center justify-between rounded-full border-[3px] border-black bg-[var(--dcl-lime)] pl-6 pr-5 text-[17px] font-extrabold transition active:scale-[0.98]"
            >
              Start a new project
              <ArrowIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href={smsHref}
              className="flex min-h-[60px] items-center gap-3 rounded-full border-[3px] border-black bg-white pl-4 pr-5 text-[16px] font-extrabold transition active:scale-[0.98]"
            >
              <ChatDotsIcon className="h-8 w-8 shrink-0 text-black" />
              <span className="leading-tight">
                Text us
                <span className="block whitespace-nowrap text-[13px] font-bold text-zinc-600">{CONTACT.phoneDisplay}</span>
              </span>
            </a>
          </div>

          {needsYou.length > 0 && (
            <section aria-labelledby="attention-heading" className="mt-8 rounded-[28px] bg-[#0a0a0a] p-5 text-white sm:p-6">
              <h2 id="attention-heading" className="text-[22px] font-black tracking-[-0.04em]">
                Needs your <span className="text-[var(--dcl-lime)]">attention</span>
              </h2>
              <ul className="mt-3 grid gap-2">
                {needsYou.map((project) => {
                  const next = nextStepFor(project.status);
                  return (
                    <li key={project.id}>
                      <Link
                        href={`/project/${encodeURIComponent(project.project_number)}`}
                        className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3 transition active:scale-[0.99]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-extrabold">{projectName(project)}</span>
                          <span className="block text-[13px] text-zinc-300">{next.headline}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 text-[14px] font-extrabold text-[var(--dcl-lime)]">
                          {next.cta}
                          <ArrowIcon className="h-4 w-4" />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {requests.length > 0 && (
            <section aria-labelledby="requests-heading" className="mt-10">
              <h2 id="requests-heading" className="text-[26px] font-black tracking-[-0.04em]">
                Requests you sent
                <span className="ml-2 text-[18px] text-zinc-400">{requests.length}</span>
              </h2>
              <p className="mt-1 text-[14px] text-zinc-600">
                Once our team sets up a project from a request, it moves to My projects below.
              </p>
              <ul className="mt-4 grid gap-4">
                {requests.map((request) => (
                  <RequestCard key={request.id} request={request} />
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="projects-heading" className="mt-10">
            <h2 id="projects-heading" className="text-[26px] font-black tracking-[-0.04em]">
              My projects{active.length > 0 && <span className="ml-2 text-[18px] text-zinc-400">{active.length}</span>}
            </h2>

            {projects.length === 0 && requests.length > 0 ? (
              <p className="mt-4 rounded-2xl bg-zinc-50 px-4 py-4 text-[15px] font-medium text-zinc-700">
                No projects yet. We&rsquo;ll set one up from your request and it will show here.
              </p>
            ) : projects.length === 0 ? (
              <div className="mt-4 rounded-[28px] bg-[var(--dcl-lime-soft)] p-5 sm:p-7">
                <p className="text-[17px] font-extrabold">No projects yet. Here&rsquo;s how it works:</p>
                <ol className="mt-4 grid gap-3 text-[15px]">
                  {[
                    ["Tell us your idea", "Text us or fill in a short form. A photo or a sentence is enough."],
                    ["We work out the details", "Our team and the factory confirm the specs, price and timing."],
                    ["Approve, pay and track", "See your quote and proof, then follow your order right here."],
                  ].map(([title, body], index) => (
                    <li key={title} className="grid grid-cols-[32px_1fr] items-start gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-[14px] font-black text-[var(--dcl-lime)]">
                        {index + 1}
                      </span>
                      <span>
                        <span className="block font-extrabold">{title}</span>
                        <span className="block text-zinc-700">{body}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-5 text-[14px] text-zinc-700">
                  Once our team sets up your project, it shows up here and we&rsquo;ll text you.
                </p>
              </div>
            ) : active.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-zinc-50 px-4 py-4 text-[15px] font-medium text-zinc-700">
                Nothing in progress right now. Start a new project any time.
              </p>
            ) : (
              <ul className="mt-4 grid gap-4">
                {active.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </ul>
            )}

            {delivered.length > 0 && (
              <details className="group mt-6 rounded-[24px] border-2 border-zinc-200 p-4 sm:p-5">
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between text-[16px] font-extrabold [&::-webkit-details-marker]:hidden">
                  Delivered ({delivered.length})
                  <span aria-hidden="true" className="text-[22px] leading-none transition-transform group-open:rotate-45">+</span>
                </summary>
                <ul className="mt-4 grid gap-4">
                  {delivered.map((project) => (
                    <ProjectCard key={project.id} project={project} />
                  ))}
                </ul>
              </details>
            )}
          </section>

          <details className="group mt-10 rounded-[24px] bg-[var(--dcl-lime-soft)] p-5">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between text-[17px] font-extrabold [&::-webkit-details-marker]:hidden">
              Account details
              <span aria-hidden="true" className="text-[22px] leading-none transition-transform group-open:rotate-45">+</span>
            </summary>
            <dl className="mt-3 grid gap-3 text-[15px]">
              <div>
                <dt className="text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500">Name</dt>
                <dd className="font-extrabold">{name}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500">Email</dt>
                <dd className="break-all font-extrabold">{user.email ?? "Not shared"}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500">Signed in with</dt>
                <dd className="font-extrabold">{provider}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500">Account type</dt>
                <dd className="font-extrabold">{ROLE_LABELS[role]}</dd>
              </div>
            </dl>

            {viewer.missingProfile && (
              <p className="mt-4 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800">
                We couldn&rsquo;t find your account record, so you&rsquo;re seeing a bare-bones account. Email{" "}
                <a href={`mailto:${CONTACT.email}`} className="font-bold underline underline-offset-2">
                  {CONTACT.email}
                </a>{" "}
                and we&rsquo;ll sort it out.
              </p>
            )}

            <form action="/auth/signout" method="post" className="mt-5">
              <button
                type="submit"
                className="h-12 rounded-full border-[3px] border-black bg-white px-6 text-[15px] font-extrabold transition hover:bg-black hover:text-white"
              >
                Sign out
              </button>
            </form>
          </details>

          <p className="mt-6 text-center text-[14px] text-zinc-600">
            Questions? Text <a href={smsHref} className="font-extrabold text-black underline underline-offset-2">{CONTACT.phoneDisplay}</a> or email{" "}
            <a href={`mailto:${CONTACT.email}`} className="font-extrabold text-black underline underline-offset-2">{CONTACT.email}</a>.
          </p>
        </section>

        <Footer />
      </main>
    </div>
  );
}
