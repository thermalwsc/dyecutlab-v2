import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "../../../../lib/auth/guard";
import { getServerSupabase } from "../../../../lib/supabase/server";
import { BRIEF_FIELDS, FACTORY_MESSAGES, FILE_CATEGORY_LABELS, factoryMoveFor, factoryNextFor } from "../../../../lib/factoryWork";
import { canQuoteInStatus, factoryQuoteStatusLabel, isFactoryQuoteStatus } from "../../../../lib/factoryQuote";
import { CHANGE_KINDS, CHANGE_KIND_LABELS, changeKindLabel } from "../../../../lib/factoryChange";
import {
  BRIEF_LABELS_ZH,
  CHANGE_KIND_ZH,
  FILE_CATEGORY_ZH,
  MESSAGES_ZH,
  MOVES_ZH,
  QUOTE_STATUS_ZH,
  localizeWhy,
  portalText,
  stageLabelFor,
} from "../../../../lib/factoryI18n";
import { threadLabels } from "../../../../lib/factoryThread";
import { getPortalLang } from "../../../../lib/portalLang";
import { projectStatusLabel } from "../../../admin/statuses";
import { Banner, param, type SearchParams } from "../../../admin/ui";
import { moveFactoryProject } from "../../actions";
import { recordFactoryChange } from "../../changeActions";
import { sendFactoryMessage } from "../../threadActions";
import { correctFactoryTranslation } from "../../correctionActions";
import { correctionLabels } from "../../../../lib/translationCorrection";
import { ArrowIcon } from "../../../updates/Icons";
import { RoleShell } from "../../../updates/RoleShell";
import { formatDate } from "../../FactoryProjectCard";
import LanguageSwitch from "../../LanguageSwitch";
import ThreadList, { type ThreadItem } from "../../ThreadList";
import QuoteForm from "./QuoteForm";

export const metadata: Metadata = { title: "Project brief — DYE CUT LAB", robots: { index: false } };

/* DCL-00031 style. Anything else is a 404 before it reaches the database. */
const NUMBER_RE = /^[A-Za-z0-9-]{3,32}$/;
const SIGNED_URL_SECONDS = 15 * 60;
const MAX_FILES = 50;

type FileRow = {
  id: string;
  file_name: string;
  storage_path: string;
  file_type: string | null;
  file_size: number | null;
  category: string | null;
  created_at: string;
};

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function FactoryProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectNumber: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { projectNumber: raw } = await params;
  const query = await searchParams;
  const projectNumber = decodeURIComponent(raw);
  if (!NUMBER_RE.test(projectNumber)) notFound();

  const { profile } = await requireRole(["factory"], {
    next: `/factory/projects/${encodeURIComponent(projectNumber)}`,
  });
  if (!profile?.factory_id) notFound();
  const lang = await getPortalLang();
  const t = portalText(lang);
  const zh = lang === "zh";

  /* Row Level Security only returns this project when it is assigned to the
     signed-in factory; the explicit filter says so again. No customer fields
     are selected: the factory gets the manufacturing brief only. */
  const supabase = await getServerSupabase();
  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, project_number, title, request, status, created_at, product_type, quantity, units, size, box_dimensions, pouch_size, closure, material, finish, flavor_count, flavor_split, use_type, artwork_status"
    )
    .eq("project_number", projectNumber)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (!project) notFound();

  const { data: fileData, error: fileError } = await supabase
    .from("project_files")
    .select("id, file_name, storage_path, file_type, file_size, category, created_at")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(MAX_FILES);
  if (fileError) console.error("FACTORY FILES:", fileError.message);
  const files = (fileData ?? []) as FileRow[];

  /* Short-lived download links, made with the factory's own session so the
     storage rules (assigned projects only) apply. */
  const links = await Promise.all(
    files.map(async (file) => {
      const { data } = await supabase.storage
        .from("project-files")
        .createSignedUrl(file.storage_path, SIGNED_URL_SECONDS, { download: file.file_name });
      return data?.signedUrl ?? null;
    })
  );

  /* The quotes this factory has already sent for the project (Row Level Security
     returns only its own factory's rows). */
  const { data: quoteData, error: quoteError } = await supabase
    .from("factory_quotes")
    .select("id, version, status, quantity, price_per_piece, tooling_cost, total, lead_days, notes, team_note, created_at")
    .eq("project_id", project.id)
    .order("version", { ascending: false })
    .limit(20);
  if (quoteError) console.error("FACTORY QUOTES:", quoteError.message);
  const quotes = quoteData ?? [];
  const { data: noteData, error: noteError } = await supabase
    .from("factory_change_notes")
    .select("id, kind, what_changed, reason, created_at")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (noteError) console.error("FACTORY CHANGE NOTES:", noteError.message);
  const notes = noteData ?? [];
  const { data: threadData, error: threadError } = await supabase
    .from("factory_messages")
    .select("id, sender_side, original_text, original_lang, translated_text, translated_lang, translation_status, translation_note, corrected_at, created_at")
    .eq("project_id", project.id)
    .order("created_at", { ascending: true })
    .limit(200);
  if (threadError) console.error("FACTORY THREAD:", threadError.message);
  const thread = (threadData ?? []) as ThreadItem[];
  const threadText = threadLabels("factory", lang);
  const hasApproved = quotes.some((q) => q.status === "approved");
  const canQuote = canQuoteInStatus(project.status) && !hasApproved;
  const why = localizeWhy(lang, param(query, "why").slice(0, 240));
  const bannerCopy = {
    ...FACTORY_MESSAGES,
    ...(zh ? MESSAGES_ZH : {}),
    ...(why ? { quote_invalid: why, change_invalid: why, thread_failed: why, correction_failed: why } : {}),
  };
  const usd = (value: unknown) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value));
  const date = (value: string) => formatDate(value, lang);

  const next = factoryNextFor(project.status, lang);
  const english = factoryMoveFor(project.status);
  const move = english && zh ? { ...english, ...MOVES_ZH[(project.status || "").toLowerCase()] } : english;
  const record = project as unknown as Record<string, unknown>;
  const brief = BRIEF_FIELDS.map(({ key, label }) => ({ label: zh ? (BRIEF_LABELS_ZH[key] ?? label) : label, value: record[key] })).filter(
    ({ value }) => value !== null && value !== undefined && String(value).trim() !== ""
  );
  const title = project.title?.trim() || project.request?.trim().split("\n")[0] || t.untitled;
  const kindLabel = (kind: string) => (zh ? (CHANGE_KIND_ZH[kind] ?? changeKindLabel(kind)) : changeKindLabel(kind));
  const categoryLabel = (category: string | null) => {
    const key = category ?? "";
    return (zh ? FILE_CATEGORY_ZH[key] : undefined) ?? FILE_CATEGORY_LABELS[key] ?? category;
  };

  return (
    <RoleShell
      badge={t.role}
      title={<>{project.project_number}.</>}
      intro={`${title.length > 90 ? `${title.slice(0, 87)}…` : title} · ${t.assigned} ${date(project.created_at)}`}
    >
      <p className="mt-6">
        <Link href="/factory" className="inline-flex min-h-[44px] items-center text-[15px] font-extrabold underline decoration-2 underline-offset-4">
          {t.allProjects}
        </Link>
      </p>

      <LanguageSwitch lang={lang} label={t.switchLabel} />
      <Banner params={query} copy={bannerCopy} />

      <div
        className={`mt-4 rounded-[24px] border-2 p-4 sm:p-5 ${
          next.tone === "action" ? "border-black bg-[var(--dcl-lime-soft)]" : "border-zinc-200 bg-white"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[18px] font-black tracking-[-0.03em]">{next.headline}</p>
          <span className="rounded-full border-2 border-black bg-white px-3 py-1 text-[12px] font-extrabold">
            {stageLabelFor(lang, project.status || "development", projectStatusLabel(project.status || "development"))}
          </span>
        </div>
        <p className="mt-1 text-[14px] leading-snug text-zinc-700">{next.detail}</p>

        {move && (
          <form action={moveFactoryProject} className="mt-4 border-t-2 border-dashed border-black/15 pt-4">
            <input type="hidden" name="project_number" value={project.project_number} />
            <input type="hidden" name="from" value={project.status ?? ""} />
            <p className="text-[13px] font-medium text-zinc-700">{move.note}</p>
            <button
              type="submit"
              className="group mt-3 flex min-h-[52px] w-full items-center justify-between rounded-full border-[3px] border-black bg-[var(--dcl-lime)] px-5 text-[15px] font-extrabold transition active:scale-[0.98] sm:w-auto sm:min-w-[280px]"
            >
              {move.button}
              <ArrowIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </button>
            <p className="mt-2 text-[12px] text-zinc-600">{t.moveSeen}</p>
          </form>
        )}
      </div>

      {(canQuote || quotes.length > 0) && (
        <section aria-labelledby="quote-heading" className="mt-6 rounded-[28px] border-2 border-black bg-white p-5 sm:p-7">
          <h2 id="quote-heading" className="text-[22px] font-black tracking-[-0.04em]">
            {t.quoteHeading}
          </h2>

          {canQuote ? (
            <>
              <p className="mt-1 text-[14px] text-zinc-700">{t.quoteIntro}</p>
              <QuoteForm
                projectNumber={project.project_number}
                defaultQuantity={project.quantity}
                labels={{
                  quantity: t.qQuantity,
                  price: t.qPrice,
                  tooling: t.qTooling,
                  toolingHint: t.qToolingHint,
                  lead: t.qLead,
                  leadHint: t.qLeadHint,
                  notes: t.qNotes,
                  total: t.qTotal,
                  totalNote: t.qTotalNote,
                  send: t.qSend,
                  review: t.qReview,
                }}
              />
            </>
          ) : (
            <p className="mt-1 text-[14px] text-zinc-700">{hasApproved ? t.quoteApproved : t.quoteClosed}</p>
          )}

          {quotes.length > 0 && (
            <div className="mt-6 border-t-2 border-dashed border-black/10 pt-5">
              <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500">{t.quotesSent}</p>
              <ul className="mt-3 grid gap-3">
                {quotes.map((quote) => {
                  const status = isFactoryQuoteStatus(quote.status)
                    ? zh
                      ? QUOTE_STATUS_ZH[quote.status]
                      : factoryQuoteStatusLabel(quote.status, "factory")
                    : String(quote.status);
                  return (
                    <li key={quote.id} className="rounded-2xl bg-zinc-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[15px] font-extrabold">{t.version(quote.version, usd(quote.total))}</p>
                        <span className="rounded-full border-2 border-black bg-white px-3 py-1 text-[12px] font-extrabold">{status}</span>
                      </div>
                      <p className="mt-1 text-[13px] text-zinc-600">
                        {t.pieces(Number(quote.quantity).toLocaleString("en-US"))} × {usd(quote.price_per_piece)}
                        {Number(quote.tooling_cost) > 0 ? ` + ${usd(quote.tooling_cost)} ${t.toolingWord}` : ""}
                        {typeof quote.lead_days === "number" ? ` · ${t.days(quote.lead_days)}` : ""} · {t.sent} {date(quote.created_at)}
                      </p>
                      {quote.status === "rejected" && quote.team_note && (
                        <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-800">
                          {t.reasonFrom} {quote.team_note}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      <section id="thread" aria-labelledby="thread-heading" className="mt-6 rounded-[28px] border-2 border-black bg-white p-5 sm:p-7">
        <h2 id="thread-heading" className="text-[22px] font-black tracking-[-0.04em]">
          {threadText.heading}
        </h2>
        <p className="mt-1 text-[14px] text-zinc-700">{threadText.intro}</p>
        <ThreadList
          messages={thread}
          viewer="factory"
          labels={threadText}
          formatDate={date}
          correction={{ action: correctFactoryTranslation, hidden: { project_number: project.project_number }, labels: correctionLabels(lang), lang }}
        />
        <form action={sendFactoryMessage} className="mt-5 grid gap-3">
          <input type="hidden" name="project_number" value={project.project_number} />
          <textarea
            name="message"
            required
            rows={3}
            maxLength={4000}
            placeholder={threadText.placeholder}
            className="w-full rounded-xl border-2 border-zinc-300 bg-white px-3 py-2.5 text-[15px] font-medium leading-relaxed text-zinc-900 outline-none transition focus:border-black"
          />
          <button
            type="submit"
            className="group flex min-h-[52px] w-full items-center justify-between rounded-full border-[3px] border-black bg-[var(--dcl-lime)] px-5 text-[15px] font-extrabold transition active:scale-[0.98] sm:w-auto sm:min-w-[220px]"
          >
            {threadText.send}
            <ArrowIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </button>
        </form>
      </section>

      <section aria-labelledby="change-heading" className="mt-6 rounded-[28px] bg-[var(--dcl-lime-soft)] p-5 sm:p-7">
        <h2 id="change-heading" className="text-[22px] font-black tracking-[-0.04em]">
          {t.changeHeading}
        </h2>
        <p className="mt-1 text-[14px] text-zinc-700">{t.changeIntro}</p>

        <form action={recordFactoryChange} className="mt-4 grid gap-4">
          <input type="hidden" name="project_number" value={project.project_number} />
          <label className="block text-[12px] font-bold uppercase tracking-[0.1em] text-zinc-600">
            {t.changeKind}
            <select
              name="kind"
              required
              defaultValue=""
              className="mt-1.5 h-12 w-full rounded-xl border-2 border-zinc-300 bg-white px-3 text-[15px] font-semibold text-zinc-900 outline-none transition focus:border-black"
            >
              <option value="" disabled>
                {t.choose}
              </option>
              {CHANGE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {zh ? (CHANGE_KIND_ZH[kind] ?? CHANGE_KIND_LABELS[kind]) : CHANGE_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[12px] font-bold uppercase tracking-[0.1em] text-zinc-600">
            {t.whatChanged}
            <textarea
              name="what_changed"
              required
              rows={2}
              maxLength={1000}
              placeholder={t.whatChangedHint}
              className="mt-1.5 w-full rounded-xl border-2 border-zinc-300 bg-white px-3 py-2.5 text-[15px] font-medium leading-relaxed text-zinc-900 outline-none transition focus:border-black"
            />
          </label>
          <label className="block text-[12px] font-bold uppercase tracking-[0.1em] text-zinc-600">
            {t.why}
            <textarea
              name="reason"
              required
              rows={2}
              maxLength={1000}
              placeholder={t.whyHint}
              className="mt-1.5 w-full rounded-xl border-2 border-zinc-300 bg-white px-3 py-2.5 text-[15px] font-medium leading-relaxed text-zinc-900 outline-none transition focus:border-black"
            />
          </label>
          <button
            type="submit"
            className="group flex min-h-[52px] w-full items-center justify-between rounded-full border-[3px] border-black bg-white px-5 text-[15px] font-extrabold transition hover:bg-black hover:text-white active:scale-[0.98] sm:w-auto sm:min-w-[280px]"
          >
            {t.recordChange}
            <ArrowIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </button>
          <p className="text-[12px] text-zinc-600">{t.noteForever}</p>
        </form>

        {notes.length > 0 && (
          <ul className="mt-6 grid gap-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-2xl bg-white p-4">
                <p className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-zinc-500">
                  {kindLabel(note.kind)} · {date(note.created_at)}
                </p>
                <p className="mt-1 text-[15px] font-bold leading-snug">{note.what_changed}</p>
                <p className="mt-1 text-[14px] leading-snug text-zinc-700">
                  {t.whyLabel} {note.reason}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-start">
        <section aria-labelledby="brief-heading" className="rounded-[28px] border-2 border-black bg-white p-5 sm:p-7">
          <h2 id="brief-heading" className="text-[22px] font-black tracking-[-0.04em]">
            {t.briefHeading}
          </h2>
          {brief.length === 0 ? (
            <p className="mt-3 text-[15px] text-zinc-600">{t.noSpecs}</p>
          ) : (
            <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {brief.map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</dt>
                  <dd className="break-words text-[16px] font-extrabold">
                    {typeof value === "number" ? value.toLocaleString("en-US") : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {project.request?.trim() && (
            <div className="mt-6 border-t-2 border-dashed border-black/10 pt-5">
              <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500">{t.asked}</p>
              <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">{project.request}</p>
            </div>
          )}
        </section>

        <section aria-labelledby="files-heading" className="rounded-[28px] bg-[var(--dcl-lime-soft)] p-5 sm:p-7">
          <h2 id="files-heading" className="text-[22px] font-black tracking-[-0.04em]">
            {t.files}
            {files.length > 0 && <span className="ml-2 text-[16px] text-zinc-500">{files.length}</span>}
          </h2>
          {files.length === 0 ? (
            <p className="mt-3 text-[15px] text-zinc-700">{t.noFiles}</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {files.map((file, index) => {
                const href = links[index];
                return (
                  <li key={file.id} className="rounded-2xl bg-white p-3.5">
                    <p className="break-all text-[14px] font-extrabold leading-snug">{file.file_name}</p>
                    <p className="mt-0.5 text-[12px] font-medium text-zinc-600">
                      {[categoryLabel(file.category), formatSize(file.file_size), date(file.created_at)].filter(Boolean).join(" · ")}
                    </p>
                    {href ? (
                      <a
                        href={href}
                        className="group mt-2.5 flex min-h-[44px] items-center justify-between rounded-full border-[3px] border-black bg-white px-4 text-[14px] font-extrabold transition hover:bg-black hover:text-white"
                      >
                        {t.download}
                        <ArrowIcon className="h-4 w-4 rotate-90" />
                      </a>
                    ) : (
                      <p className="mt-2 text-[12px] font-bold text-red-700">{t.downloadMissing}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-[12px] text-zinc-600">{t.linksValid}</p>
        </section>
      </div>
    </RoleShell>
  );
}
