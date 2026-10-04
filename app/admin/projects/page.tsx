import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_LABELS } from "../../../lib/auth/roles";
import { requireRole } from "../../../lib/auth/guard";
import { getServerSupabase } from "../../../lib/supabase/server";
import { ArrowIcon } from "../../updates/Icons";
import { RoleShell } from "../../updates/RoleShell";
import { ADMIN_MESSAGES } from "../messages";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, projectStatusLabel } from "../statuses";
import {
  AdminTabs,
  BTN,
  Banner,
  Empty,
  FIELD,
  Pagination,
  Panel,
  Pill,
  cleanSearch,
  formatDate,
  param,
  readPage,
  type SearchParams,
} from "../ui";

export const metadata: Metadata = { title: "Projects — DYE CUT LAB", robots: { index: false } };

const PAGE_SIZE = 20;

type Row = {
  id: string;
  project_number: string;
  title: string;
  status: string;
  created_at: string;
  owner_id: string | null;
  factory_id: string | null;
  archived_at: string | null;
};

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { role } = await requireRole(["dcl_staff", "dcl_admin"], { next: "/admin/projects" });
  const supabase = await getServerSupabase();

  const status = param(params, "status");
  const q = cleanSearch(param(params, "q"));
  const showArchived = param(params, "archived") === "1";
  const page = readPage(params);

  let query = supabase
    .from("projects")
    .select("id, project_number, title, status, created_at, owner_id, factory_id, archived_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  if (q) query = query.or(`project_number.ilike.%${q}%,title.ilike.%${q}%`);
  query = showArchived ? query.not("archived_at", "is", null) : query.is("archived_at", null);

  const { data, count, error } = await query;
  if (error) console.error("PROJECTS LIST:", error.message);
  const rows = (data ?? []) as Row[];

  /* Names for the owner / factory columns (the team may read both tables). */
  const ownerIds = [...new Set(rows.map((r) => r.owner_id).filter(Boolean))] as string[];
  const factoryIds = [...new Set(rows.map((r) => r.factory_id).filter(Boolean))] as string[];
  const [owners, factories] = await Promise.all([
    ownerIds.length ? supabase.from("profiles").select("id, full_name, email").in("id", ownerIds) : { data: [] },
    factoryIds.length ? supabase.from("factories").select("id, name").in("id", factoryIds) : { data: [] },
  ]);
  const ownerName = new Map((owners.data ?? []).map((o) => [o.id, o.full_name || o.email || "Customer"]));
  const factoryName = new Map((factories.data ?? []).map((f) => [f.id, f.name]));

  return (
    <RoleShell badge={ROLE_LABELS[role]} title={<>Projects.</>} intro="Every project, newest first.">
      <AdminTabs active="/admin/projects" isAdmin={role === "dcl_admin"} />
      <Banner params={params} copy={ADMIN_MESSAGES} />

      <form className="mt-6 grid gap-3 rounded-2xl border-2 border-zinc-200 bg-white p-4 sm:grid-cols-[1fr_200px_auto] sm:items-end">
        <label className="block text-[13px] font-bold">
          Search
          <input name="q" defaultValue={q} placeholder="DCL-00031 or title" className={FIELD} />
        </label>
        <label className="block text-[13px] font-bold">
          Status
          <select name="status" defaultValue={status} className={FIELD}>
            <option value="">All statuses</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={BTN}>
          Filter
        </button>
        <label className="flex items-center gap-2 text-[13px] font-bold sm:col-span-3">
          <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} className="h-4 w-4 accent-black" />
          Show archived projects only
        </label>
      </form>

      <div className="mt-6">
        <Panel
          title={`${count ?? 0} ${showArchived ? "archived " : ""}project${count === 1 ? "" : "s"}`}
          action={
            <Link href="/admin/projects/new" className={BTN}>
              New project
            </Link>
          }
        >
          {rows.length === 0 ? (
            <Empty>No projects match. Try another search or status.</Empty>
          ) : (
            <ul className="divide-y divide-zinc-200">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link href={`/admin/projects/${row.id}`} className="group flex items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-bold group-hover:underline">{row.title}</p>
                      <p className="mt-1 text-[13px] text-zinc-600">
                        <span className="font-bold text-black">{row.project_number}</span> · {formatDate(row.created_at)}
                      </p>
                      <p className="mt-0.5 text-[13px] text-zinc-600">
                        {row.owner_id ? ownerName.get(row.owner_id) ?? "Customer" : "Not linked"} ·{" "}
                        {row.factory_id ? factoryName.get(row.factory_id) ?? "Factory" : "No factory"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Pill>{projectStatusLabel(row.status)}</Pill>
                      <ArrowIcon className="hidden h-4 w-4 text-zinc-400 sm:block" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Pagination basePath="/admin/projects" params={params} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
        </Panel>
      </div>
    </RoleShell>
  );
}
