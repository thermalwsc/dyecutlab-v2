import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ROLE_LABELS } from "../../../../lib/auth/roles";
import { requireRole } from "../../../../lib/auth/guard";
import { getServerSupabase } from "../../../../lib/supabase/server";
import { RoleShell } from "../../../updates/RoleShell";
import { assignProject, deleteProject, setProjectArchived, updateProject } from "../../actions";
import { ADMIN_MESSAGES } from "../../messages";
import { projectStatusLabel } from "../../statuses";
import { AdminTabs, BTN, BTN_DANGER, BTN_GHOST, Banner, FIELD, LABEL, Panel, Pill, formatDate, param, type SearchParams } from "../../ui";
import ProjectFields from "../ProjectForm";

export const metadata: Metadata = { title: "Project — DYE CUT LAB", robots: { index: false } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProjectDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const { role } = await requireRole(["dcl_staff", "dcl_admin"], { next: `/admin/projects/${id}` });
  const supabase = await getServerSupabase();

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, project_number, title, request, product_type, quantity, units, size, material, finish, status, created_at, owner_id, factory_id, archived_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const [customers, factories] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").eq("role", "customer").is("disabled_at", null).order("email"),
    supabase.from("factories").select("id, name, active").order("name"),
  ]);

  const isAdmin = role === "dcl_admin";
  const confirming = param(query, "confirm") === "delete";
  const activeFactories = (factories.data ?? []).filter((f) => f.active || f.id === project.factory_id);

  return (
    <RoleShell
      badge={ROLE_LABELS[role]}
      title={<>{project.project_number}.</>}
      intro={`${project.title} · created ${formatDate(project.created_at)}`}
    >
      <AdminTabs active="/admin/projects" isAdmin={isAdmin} />
      <Banner params={query} copy={ADMIN_MESSAGES} />
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[14px]">
        <Link href="/admin/projects" className="font-bold underline underline-offset-2">
          ← All projects
        </Link>
        <Pill>{projectStatusLabel(project.status)}</Pill>
        {project.archived_at && <Pill>Archived {formatDate(project.archived_at)}</Pill>}
        <Link href={`/project/${encodeURIComponent(project.project_number)}`} className="font-bold underline underline-offset-2">
          Open project page →
        </Link>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Panel title="Details">
          <form action={updateProject} className="grid gap-5">
            <input type="hidden" name="id" value={project.id} />
            <ProjectFields values={project} />
            <button type="submit" className={BTN}>
              Save changes
            </button>
          </form>
        </Panel>

        <div className="grid gap-6">
          <Panel title="Customer and factory" intro="Who owns the project, and which factory makes it.">
            <form action={assignProject} className="grid gap-4">
              <input type="hidden" name="id" value={project.id} />
              <label className={LABEL}>
                Customer
                <select name="owner_id" defaultValue={project.owner_id ?? ""} className={FIELD}>
                  <option value="">Not linked</option>
                  {(customers.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name ? `${c.full_name} · ${c.email}` : c.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className={LABEL}>
                Factory
                <select name="factory_id" defaultValue={project.factory_id ?? ""} className={FIELD}>
                  <option value="">No factory</option>
                  {activeFactories.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {!f.active ? " (switched off)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {activeFactories.length === 0 && (
                <p className="text-[13px] text-zinc-600">
                  No factories yet.{" "}
                  <Link href="/admin/factories" className="font-bold underline underline-offset-2">
                    Add one
                  </Link>
                  .
                </p>
              )}
              <button type="submit" className={BTN}>
                Save assignment
              </button>
            </form>
          </Panel>

          <Panel title={project.archived_at ? "Archived" : "Archive"}>
            <form action={setProjectArchived}>
              <input type="hidden" name="id" value={project.id} />
              <input type="hidden" name="archive" value={project.archived_at ? "0" : "1"} />
              <p className="mb-3 text-[14px] text-zinc-600">
                {project.archived_at
                  ? "This project is hidden from the project list."
                  : "Hide this project from the list without deleting anything."}
              </p>
              <button type="submit" className={BTN_GHOST}>
                {project.archived_at ? "Restore project" : "Archive project"}
              </button>
            </form>
          </Panel>

          {isAdmin && (
            <Panel title="Delete project">
              {confirming ? (
                <form action={deleteProject} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="id" value={project.id} />
                  <p className="w-full text-[14px] font-semibold text-red-700">
                    This permanently deletes {project.project_number}. Projects with messages or files can only be archived.
                  </p>
                  <button type="submit" className={BTN_DANGER}>
                    Yes, delete it
                  </button>
                  <Link href={`/admin/projects/${project.id}`} className={BTN_GHOST}>
                    Cancel
                  </Link>
                </form>
              ) : (
                <Link href={`/admin/projects/${project.id}?confirm=delete`} className={BTN_GHOST}>
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
