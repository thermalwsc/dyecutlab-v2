import type { Metadata } from "next";
import { ROLE_LABELS } from "../../../lib/auth/roles";
import { requireRole } from "../../../lib/auth/guard";
import { getServerSupabase } from "../../../lib/supabase/server";
import { RoleShell } from "../../updates/RoleShell";
import { createFactory, setFactoryActive, updateFactory } from "../actions";
import { ADMIN_MESSAGES } from "../messages";
import { AdminTabs, BTN, BTN_GHOST, Banner, Empty, FIELD, LABEL, Panel, Pill, TEXTAREA, type SearchParams } from "../ui";

export const metadata: Metadata = { title: "Factories — DYE CUT LAB", robots: { index: false } };

type Factory = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
};

function FactoryFields({ f }: { f?: Factory }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={`${LABEL} sm:col-span-2`}>
        Name
        <input name="name" required maxLength={120} defaultValue={f?.name ?? ""} className={FIELD} />
      </label>
      <label className={LABEL}>
        Contact name
        <input name="contact_name" maxLength={120} defaultValue={f?.contact_name ?? ""} className={FIELD} />
      </label>
      <label className={LABEL}>
        Contact email
        <input name="contact_email" type="email" maxLength={254} defaultValue={f?.contact_email ?? ""} className={FIELD} />
      </label>
      <label className={LABEL}>
        Phone
        <input name="phone" maxLength={40} defaultValue={f?.phone ?? ""} className={FIELD} />
      </label>
      <label className={`${LABEL} sm:col-span-2`}>
        Notes
        <textarea name="notes" rows={3} maxLength={2000} defaultValue={f?.notes ?? ""} className={TEXTAREA} />
      </label>
    </div>
  );
}

export default async function FactoriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { role } = await requireRole(["dcl_staff", "dcl_admin"], { next: "/admin/factories" });
  const isAdmin = role === "dcl_admin";
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("factories")
    .select("id, name, contact_name, contact_email, phone, notes, active")
    .order("active", { ascending: false })
    .order("name");
  if (error) console.error("FACTORIES LIST:", error.message);
  const factories = (data ?? []) as Factory[];

  return (
    <RoleShell badge={ROLE_LABELS[role]} title={<>Factories.</>} intro="Partner factories that projects can be assigned to.">
      <AdminTabs active="/admin/factories" isAdmin={isAdmin} />
      <Banner params={params} copy={ADMIN_MESSAGES} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Panel title={`${factories.length} factor${factories.length === 1 ? "y" : "ies"}`}>
          {factories.length === 0 ? (
            <Empty>No factories yet.{isAdmin ? " Add the first one." : ""}</Empty>
          ) : (
            <ul className="divide-y divide-zinc-200">
              {factories.map((f) => (
                <li key={f.id} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold">{f.name}</p>
                      <p className="mt-0.5 text-[13px] text-zinc-600">
                        {[f.contact_name, f.contact_email, f.phone].filter(Boolean).join(" · ") || "No contact details"}
                      </p>
                    </div>
                    <Pill>{f.active ? "Active" : "Switched off"}</Pill>
                  </div>
                  {isAdmin && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-[13px] font-bold underline underline-offset-2">Edit</summary>
                      <form action={updateFactory} className="mt-3 grid gap-4">
                        <input type="hidden" name="id" value={f.id} />
                        <FactoryFields f={f} />
                        <button type="submit" className={BTN}>
                          Save factory
                        </button>
                      </form>
                      <form action={setFactoryActive} className="mt-3">
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="active" value={f.active ? "0" : "1"} />
                        <button type="submit" className={BTN_GHOST}>
                          {f.active ? "Switch off" : "Switch on"}
                        </button>
                      </form>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {isAdmin ? (
          <Panel title="Add a factory">
            <form action={createFactory} className="grid gap-4">
              <FactoryFields />
              <button type="submit" className={BTN}>
                Add factory
              </button>
            </form>
          </Panel>
        ) : (
          <Panel title="Add a factory">
            <p className="text-[14px] text-zinc-600">Adding and editing factories is done by a DCL admin.</p>
          </Panel>
        )}
      </div>
    </RoleShell>
  );
}
