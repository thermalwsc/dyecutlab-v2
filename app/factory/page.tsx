import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT } from "../../lib/contact";
import { ROLE_LABELS } from "../../lib/auth/roles";
import { requireRole } from "../../lib/auth/guard";
import { getServerSupabase } from "../../lib/supabase/server";
import { ArrowIcon } from "../updates/Icons";
import { RoleCard, RoleShell } from "../updates/RoleShell";

export const metadata: Metadata = {
  title: "Factory portal — DYE CUT LAB",
  robots: { index: false },
};

/* Landing page for partner factory accounts. The factory row is readable by its
   own members through RLS (factories_select_own_factory), so no service role is
   needed here. */

export default async function FactoryPage() {
  const { user, profile, role } = await requireRole(["factory"], { next: "/factory" });

  const supabase = await getServerSupabase();
  const { data: factory } = profile?.factory_id
    ? await supabase
        .from("factories")
        .select("name, contact_name, contact_email, phone, active")
        .eq("id", profile.factory_id)
        .maybeSingle()
    : { data: null };

  const factoryName: string | null = factory?.name ?? null;

  return (
    <RoleShell
      badge={ROLE_LABELS[role]}
      title={factoryName ? <>{factoryName}.</> : <>Factory portal.</>}
      intro={
        factoryName
          ? `Signed in as ${profile?.full_name || user.email}. Work DYE CUT LAB sends to ${factoryName} will appear here.`
          : `Signed in as ${profile?.full_name || user.email}. No factory is linked to this account yet — ask DYE CUT LAB to set that up.`
      }
    >
      <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-start">
        <RoleCard title="Production jobs">
          <p>
            Nothing assigned yet. Job sheets, artwork files and due dates will land here once production
            tracking is wired up.
          </p>
        </RoleCard>

        <RoleCard title="Your details on file" tone="white">
          <dl className="grid gap-3">
            <Detail label="Factory" value={factoryName ?? "Not linked yet"} />
            <Detail label="Contact on record" value={factory?.contact_name ?? "—"} />
            <Detail label="Email on record" value={factory?.contact_email ?? user.email ?? "—"} />
            <Detail label="Phone on record" value={factory?.phone ?? "—"} />
          </dl>
          <p className="text-[13px] text-zinc-600">
            Something wrong? Call or text {CONTACT.phoneDisplay} or email{" "}
            <a href={`mailto:${CONTACT.email}`} className="font-bold text-black underline underline-offset-2">
              {CONTACT.email}
            </a>
            .
          </p>
        </RoleCard>
      </div>

      <Link
        href="/"
        className="group mt-8 inline-flex h-14 items-center gap-4 rounded-full border-[3px] border-black bg-white pl-6 pr-5 text-[16px] font-extrabold text-black"
      >
        Back to the site
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
