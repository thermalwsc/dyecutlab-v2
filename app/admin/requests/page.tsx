import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_LABELS } from "../../../lib/auth/roles";
import { requireRole } from "../../../lib/auth/guard";
import { getServerSupabase } from "../../../lib/supabase/server";
import { RoleShell } from "../../updates/RoleShell";
import StatusSelect from "../StatusSelect";
import { ADMIN_MESSAGES } from "../messages";
import { QUOTE_STATUSES, QUOTE_STATUS_LABELS, type QuoteStatus } from "../statuses";
import {
  AdminTabs,
  BTN,
  Banner,
  Empty,
  FIELD,
  Pagination,
  Panel,
  cleanSearch,
  formatDate,
  formatPhone,
  param,
  readPage,
  type SearchParams,
} from "../ui";

export const metadata: Metadata = { title: "Quote requests — DYE CUT LAB", robots: { index: false } };

const PAGE_SIZE = 20;

type Row = { id: string; description: string; phone: string; status: string; created_at: string; project_id: string | null };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { role } = await requireRole(["dcl_staff", "dcl_admin"], { next: "/admin/requests" });
  const supabase = await getServerSupabase();

  const status = param(params, "status");
  const q = cleanSearch(param(params, "q"));
  const page = readPage(params);

  let query = supabase
    .from("quote_requests")
    .select("id, description, phone, status, created_at, project_id", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if ((QUOTE_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  if (q) query = query.or(`description.ilike.%${q}%,phone.ilike.%${q}%`);

  const { data, count, error } = await query;
  if (error) console.error("REQUESTS LIST:", error.message);
  const rows = (data ?? []) as Row[];

  return (
    <RoleShell badge={ROLE_LABELS[role]} title={<>Quote requests.</>} intro="Requests from the website, newest first.">
      <AdminTabs active="/admin/requests" isAdmin={role === "dcl_admin"} />
      <Banner params={params} copy={ADMIN_MESSAGES} />

      <form className="mt-6 grid gap-3 rounded-2xl border-2 border-zinc-200 bg-white p-4 sm:grid-cols-[1fr_200px_auto] sm:items-end">
        <label className="block text-[13px] font-bold">
          Search
          <input name="q" defaultValue={q} placeholder="Description or phone" className={FIELD} />
        </label>
        <label className="block text-[13px] font-bold">
          Status
          <select name="status" defaultValue={status} className={FIELD}>
            <option value="">All statuses</option>
            {QUOTE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {QUOTE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={BTN}>
          Filter
        </button>
      </form>

      <div className="mt-6">
        <Panel title={`${count ?? 0} request${count === 1 ? "" : "s"}`}>
          {error ? (
            <Empty>
              Requests can&rsquo;t be read yet. Run <code className="font-bold">20261001000000_team_reads_requests.sql</code> in
              Supabase.
            </Empty>
          ) : rows.length === 0 ? (
            <Empty>No requests match. Try another search or status.</Empty>
          ) : (
            <ul className="divide-y divide-zinc-200">
              {rows.map((row) => (
                <li key={row.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <Link href={`/admin/requests/${row.id}`} className="group min-w-0">
                    <p className="line-clamp-2 text-[15px] font-bold leading-snug group-hover:underline">{row.description}</p>
                    <p className="mt-1 text-[13px] text-zinc-600">
                      {formatPhone(row.phone)} · {formatDate(row.created_at)}
                      {row.project_id && <> · Project created</>}
                    </p>
                  </Link>
                  <div className="shrink-0">
                    <StatusSelect id={row.id} status={(row.status as QuoteStatus) ?? "new"} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Pagination basePath="/admin/requests" params={params} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
        </Panel>
      </div>
    </RoleShell>
  );
}
