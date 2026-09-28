import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_LABELS } from "../../lib/auth/roles";
import { requireRole } from "../../lib/auth/guard";
import { ArrowIcon } from "../updates/Icons";
import { RoleCard, RoleShell } from "../updates/RoleShell";

export const metadata: Metadata = {
  title: "Team workspace — DYE CUT LAB",
  robots: { index: false },
};

/* Landing page for the DYE CUT LAB team (dcl_staff and dcl_admin). It is a
   stub on purpose: the point of this work is the accounts layer underneath, so
   this page proves the guard and gives the team somewhere to land. */

export default async function AdminPage() {
  const { user, profile, role } = await requireRole(["dcl_staff", "dcl_admin"], { next: "/admin" });

  const name = profile?.full_name || user.email || "there";
  const isAdmin = role === "dcl_admin";

  return (
    <RoleShell
      badge={ROLE_LABELS[role]}
      title={<>Team workspace.</>}
      intro={`Signed in as ${name}. Quote requests, projects and factory work will live here as we wire them up.`}
    >
      <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-start">
        <RoleCard title="Accounts">
          {isAdmin ? (
            <>
              <p>Invite staff and factory users, change roles, and switch accounts on or off.</p>
              <Link
                href="/admin/accounts"
                className="group flex h-14 items-center justify-between rounded-full border-[3px] border-black bg-[var(--dcl-lime)] pl-6 pr-5 text-[16px] font-extrabold text-black"
              >
                Manage accounts
                <ArrowIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </>
          ) : (
            <p>
              Inviting people and changing roles is a DCL admin job. Ask an admin if someone needs access, or
              if your own access looks wrong.
            </p>
          )}
        </RoleCard>

        <RoleCard title="Projects" tone="dark">
          <p>
            Nothing here yet — the next step is scoping projects to the account that owns them, then this page
            becomes the working list for quotes and production.
          </p>
        </RoleCard>
      </div>
    </RoleShell>
  );
}
