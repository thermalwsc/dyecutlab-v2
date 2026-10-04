import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_LABELS } from "../../../../lib/auth/roles";
import { requireRole } from "../../../../lib/auth/guard";
import { getServerSupabase } from "../../../../lib/supabase/server";
import { RoleShell } from "../../../updates/RoleShell";
import { createProject } from "../../actions";
import { ADMIN_MESSAGES } from "../../messages";
import { AdminTabs, BTN, Banner, FIELD, LABEL, Panel, type SearchParams } from "../../ui";
import ProjectFields from "../ProjectForm";

export const metadata: Metadata = { title: "New project — DYE CUT LAB", robots: { index: false } };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { role } = await requireRole(["dcl_staff", "dcl_admin"], { next: "/admin/projects/new" });
  const supabase = await getServerSupabase();
  const { data: customers } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "customer")
    .is("disabled_at", null)
    .order("email");

  return (
    <RoleShell badge={ROLE_LABELS[role]} title={<>New project.</>} intro="Create a project on behalf of a customer.">
      <AdminTabs active="/admin/projects" isAdmin={role === "dcl_admin"} />
      <Banner params={params} copy={ADMIN_MESSAGES} />
      <p className="mt-4 text-[14px]">
        <Link href="/admin/projects" className="font-bold underline underline-offset-2">
          ← All projects
        </Link>
      </p>
      <div className="mt-4 max-w-3xl">
        <Panel title="Project details">
          <form action={createProject} className="grid gap-5">
            <label className={LABEL}>
              Customer
              <select name="owner_id" defaultValue="" className={FIELD}>
                <option value="">Not linked yet</option>
                {(customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name ? `${c.full_name} · ${c.email}` : c.email}
                  </option>
                ))}
              </select>
            </label>
            <ProjectFields />
            <button type="submit" className={BTN}>
              Create project
            </button>
          </form>
        </Panel>
      </div>
    </RoleShell>
  );
}
