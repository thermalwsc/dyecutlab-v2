import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ROLE_LABELS } from "../../../../lib/auth/roles";
import { requireRole } from "../../../../lib/auth/guard";
import { getServerSupabase } from "../../../../lib/supabase/server";
import { RoleShell } from "../../../updates/RoleShell";
import StatusSelect from "../../StatusSelect";
import { createProjectFromRequest, deleteQuote, updateQuoteNotes } from "../../actions";
import { ADMIN_MESSAGES } from "../../messages";
import type { QuoteStatus } from "../../statuses";
import { AdminTabs, BTN, BTN_DANGER, BTN_GHOST, Banner, Panel, TEXTAREA, formatDate, formatPhone, param, type SearchParams } from "../../ui";

export const metadata: Metadata = { title: "Quote request — DYE CUT LAB", robots: { index: false } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RequestDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const { role } = await requireRole(["dcl_staff", "dcl_admin"], { next: `/admin/requests/${id}` });
  const supabase = await getServerSupabase();

  const { data: request } = await supabase
    .from("quote_requests")
    .select("id, description, phone, status, created_at, notes, project_id, sms_consent")
    .eq("id", id)
    .maybeSingle();
  if (!request) notFound();

  const isAdmin = role === "dcl_admin";
  const confirming = param(query, "confirm") === "delete";

  return (
    <RoleShell badge={ROLE_LABELS[role]} title={<>Quote request.</>} intro={`Received ${formatDate(request.created_at)}.`}>
      <AdminTabs active="/admin/requests" isAdmin={isAdmin} />
      <Banner params={query} copy={ADMIN_MESSAGES} />
      <p className="mt-4 text-[14px]">
        <Link href="/admin/requests" className="font-bold underline underline-offset-2">
          ← All requests
        </Link>
      </p>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Panel title="What they want made">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">{request.description}</p>
          <dl className="mt-5 grid gap-3 text-[14px] sm:grid-cols-2">
            <div>
              <dt className="font-bold text-zinc-500">Phone</dt>
              <dd>
                <a href={`sms:${request.phone}`} className="font-extrabold underline underline-offset-2">
                  {formatPhone(request.phone)}
                </a>
              </dd>
            </div>
            <div>
              <dt className="font-bold text-zinc-500">Text consent</dt>
              <dd className="font-bold">{request.sms_consent ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="font-bold text-zinc-500">Status</dt>
              <dd className="mt-1">
                <StatusSelect id={request.id} status={request.status as QuoteStatus} />
              </dd>
            </div>
          </dl>
        </Panel>

        <div className="grid gap-6">
          <Panel title="Project">
            {request.project_id ? (
              <Link href={`/admin/projects/${request.project_id}`} className={BTN}>
                Open project →
              </Link>
            ) : (
              <form action={createProjectFromRequest}>
                <input type="hidden" name="id" value={request.id} />
                <p className="mb-3 text-[14px] text-zinc-600">Turn this request into a project, prefilled with the description.</p>
                <button type="submit" className={BTN}>
                  Create project from this request
                </button>
              </form>
            )}
          </Panel>

          <Panel title="Internal notes" intro="Only the DYE CUT LAB team can see these.">
            <form action={updateQuoteNotes} className="grid gap-3">
              <input type="hidden" name="id" value={request.id} />
              <label className="sr-only" htmlFor="notes">
                Notes
              </label>
              <textarea id="notes" name="notes" rows={5} maxLength={2000} defaultValue={request.notes ?? ""} className={TEXTAREA} />
              <button type="submit" className={BTN}>
                Save notes
              </button>
            </form>
          </Panel>

          {isAdmin && (
            <Panel title="Delete request">
              {confirming ? (
                <form action={deleteQuote} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="id" value={request.id} />
                  <p className="w-full text-[14px] font-semibold text-red-700">This removes the request for good. Are you sure?</p>
                  <button type="submit" className={BTN_DANGER}>
                    Yes, delete it
                  </button>
                  <Link href={`/admin/requests/${request.id}`} className={BTN_GHOST}>
                    Cancel
                  </Link>
                </form>
              ) : (
                <Link href={`/admin/requests/${request.id}?confirm=delete`} className={BTN_GHOST}>
                  Delete…
                </Link>
              )}
            </Panel>
          )}
        </div>
      </div>
    </RoleShell>
  );
}
