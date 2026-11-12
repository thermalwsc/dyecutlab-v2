import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT } from "../../lib/contact";
import { requireRole } from "../../lib/auth/guard";
import { getServerSupabase } from "../../lib/supabase/server";
import { ArrowIcon } from "../updates/Icons";
import { RoleCard, RoleShell } from "../updates/RoleShell";
import { FACTORY_MESSAGES, factoryNextFor } from "../../lib/factoryWork";
import { MESSAGES_ZH, portalText } from "../../lib/factoryI18n";
import { getPortalLang } from "../../lib/portalLang";
import { Banner, type SearchParams } from "../admin/ui";
import { FactoryProjectCard, type FactoryProject } from "./FactoryProjectCard";
import LanguageSwitch from "./LanguageSwitch";

export const metadata: Metadata = {
  title: "Factory portal — DYE CUT LAB",
  robots: { index: false },
};

/* Landing page for partner factory accounts. The factory row is readable by its
   own members through RLS (factories_select_own_factory), so no service role is
   needed here. The words come from lib/factoryI18n.ts: Chinese until the factory
   picks English. */

export default async function FactoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const { user, profile } = await requireRole(["factory"], { next: "/factory" });
  const lang = await getPortalLang();
  const t = portalText(lang);

  const supabase = await getServerSupabase();
  const { data: factory } = profile?.factory_id
    ? await supabase
        .from("factories")
        .select("name, contact_name, contact_email, phone, active")
        .eq("id", profile.factory_id)
        .maybeSingle()
    : { data: null };

  const factoryName: string | null = factory?.name ?? null;

  /* Only this factory's projects, and no customer details: the brief fields
     only. Row Level Security (factory_id = my_factory_id()) is the real fence;
     the explicit filter keeps the query honest. */
  let projects: FactoryProject[] = [];
  if (profile?.factory_id) {
    const { data, error } = await supabase
      .from("projects")
      .select("id, project_number, title, request, product_type, quantity, status, created_at")
      .eq("factory_id", profile.factory_id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) console.error("FACTORY PROJECTS:", error.message);
    projects = (data ?? []) as FactoryProject[];
  }
  const attention = projects.filter((p) => factoryNextFor(p.status).tone === "action");
  const waiting = projects.filter((p) => factoryNextFor(p.status).tone === "waiting");
  const finished = projects.filter((p) => factoryNextFor(p.status).tone === "done");
  const who = profile?.full_name || user.email || "";
  const copy = lang === "zh" ? { ...FACTORY_MESSAGES, ...MESSAGES_ZH } : FACTORY_MESSAGES;

  return (
    <RoleShell
      badge={t.role}
      title={factoryName ? <>{factoryName}.</> : <>{t.portalTitle}</>}
      intro={
        factoryName
          ? projects.length === 0
            ? t.introLinked(who, factoryName)
            : attention.length > 0
              ? t.introAttention(attention.length)
              : t.introCalm
          : t.introNoFactory(who)
      }
    >
      <LanguageSwitch lang={lang} label={t.switchLabel} />
      <Banner params={query} copy={copy} />

      {projects.length > 0 && (
        <ul aria-label={t.summary} className="mt-6 flex flex-wrap gap-2">
          {[
            { label: t.chipNeedYou, count: attention.length, hot: true },
            { label: t.chipOnTheWay, count: waiting.length, hot: false },
            { label: t.chipDelivered, count: finished.length, hot: false },
          ]
            .filter((chip) => chip.count > 0)
            .map((chip) => (
              <li
                key={chip.label}
                className={`rounded-full border-2 border-black px-4 py-1.5 text-[14px] font-extrabold ${chip.hot ? "bg-[var(--dcl-lime)]" : "bg-white"}`}
              >
                {chip.count} {chip.label}
              </li>
            ))}
        </ul>
      )}

      {projects.length === 0 ? (
        <div className="mt-8 rounded-[28px] bg-[var(--dcl-lime-soft)] p-5 sm:p-8">
          <h2 className="text-[clamp(20px,5.4vw,26px)] font-black tracking-[-0.04em]">{t.productionJobs}</h2>
          <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-zinc-800">{t.nothingAssigned}</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-8">
          {attention.length > 0 && (
            <section aria-labelledby="attention-heading">
              <h2 id="attention-heading" className="text-[26px] font-black tracking-[-0.04em]">
                {t.attentionA}
                <span className="rounded-[0.3em] bg-[var(--dcl-lime)] px-[0.2em]">{t.attentionB}</span>
              </h2>
              <ul className="mt-4 grid gap-4 lg:grid-cols-2">
                {attention.map((project) => (
                  <FactoryProjectCard key={project.id} project={project} lang={lang} />
                ))}
              </ul>
            </section>
          )}

          {waiting.length > 0 && (
            <section aria-labelledby="waiting-heading">
              <h2 id="waiting-heading" className="text-[26px] font-black tracking-[-0.04em]">
                {t.onTheWay} <span className="ml-1 text-[18px] text-zinc-400">{waiting.length}</span>
              </h2>
              <ul className="mt-4 grid gap-4 lg:grid-cols-2">
                {waiting.map((project) => (
                  <FactoryProjectCard key={project.id} project={project} lang={lang} />
                ))}
              </ul>
            </section>
          )}

          {finished.length > 0 && (
            <details className="group rounded-[24px] border-2 border-zinc-200 p-4 sm:p-5">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between text-[16px] font-extrabold [&::-webkit-details-marker]:hidden">
                {t.delivered(finished.length)}
                <span aria-hidden="true" className="text-[22px] leading-none transition-transform group-open:rotate-45">+</span>
              </summary>
              <ul className="mt-4 grid gap-4 lg:grid-cols-2">
                {finished.map((project) => (
                  <FactoryProjectCard key={project.id} project={project} lang={lang} />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-start">
        <RoleCard title={t.yourDetails} tone="white">
          <dl className="grid gap-3">
            <Detail label={t.factory} value={factoryName ?? t.notLinked} />
            <Detail label={t.contactOnRecord} value={factory?.contact_name ?? "—"} />
            <Detail label={t.emailOnRecord} value={factory?.contact_email ?? user.email ?? "—"} />
            <Detail label={t.phoneOnRecord} value={factory?.phone ?? "—"} />
          </dl>
          <p className="text-[13px] text-zinc-600">
            {t.wrongBefore}
            {CONTACT.phoneDisplay}
            {t.wrongMid}
            <a href={`mailto:${CONTACT.email}`} className="font-bold text-black underline underline-offset-2">
              {CONTACT.email}
            </a>
            {t.wrongAfter}
          </p>
        </RoleCard>
      </div>

      <Link
        href="/"
        className="group mt-8 inline-flex h-14 items-center gap-4 rounded-full border-[3px] border-black bg-white pl-6 pr-5 text-[16px] font-extrabold text-black"
      >
        {t.backToSite}
        <ArrowIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
      </Link>
    </RoleShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</dt>
      <dd className="break-words font-extrabold text-black">{value}</dd>
    </div>
  );
}
