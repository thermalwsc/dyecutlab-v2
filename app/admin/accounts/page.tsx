import type { Metadata } from "next";
import { APP_ROLES, ROLE_LABELS } from "../../../lib/auth/roles";
import { requireRole } from "../../../lib/auth/guard";
import { getServiceRoleSupabase, isServiceRoleConfigured } from "../../../lib/supabase/admin";
import { getServerSupabase } from "../../../lib/supabase/server";
import { PROFILE_COLUMNS, toProfileRecord, type ProfileRecord } from "../../../lib/auth/viewer";
import { RoleCard, RoleShell } from "../../updates/RoleShell";
import { loadAuthStatuses, type AuthAccountStatus } from "./accountStatus";
import { createFactory, inviteAccount, sendSignInLink, setAccountActive, updateAccount } from "./actions";

export const metadata: Metadata = {
  title: "Accounts — DYE CUT LAB",
  robots: { index: false },
};

/* =========================================================
   /admin/accounts — who can get in, and as what
============================================================
   dcl_admin only. Reads go through the caller's own Supabase client, so RLS
   still applies (the DCL team may read every profile); only the writes use the
   service role, and those live in actions.ts with their own checks.

   The forms are plain HTML posting to server actions — no client state to get
   out of sync, and the rules stay in one place on the server. */

type Params = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const ERROR_COPY: Record<string, string> = {
  service_key_missing:
    "Account changes are switched off on this environment: SUPABASE_SERVICE_ROLE_KEY is not set. Add it (Vercel → Settings → Environment Variables, or .env.local) and redeploy. See AUTH_SETUP.md.",
  rate_limited: "Slow down for a moment — too many account changes from this session.",
  rate_limited_email: "Supabase just sent an email to that address. Wait a minute before sending another.",
  bad_email: "That email address doesn't look valid.",
  bad_role: "Pick one of: DCL staff, DCL admin, factory.",
  factory_required: "A factory account needs a factory. Add the factory below first, then pick it here.",
  self_change: "You can't change your own access — ask another admin to do it.",
  last_admin:
    "That's the last active DCL admin. Give admin access to someone else first, otherwise nobody could get back in.",
  not_found: "That account no longer exists. Reload the page.",
  bad_request: "That request was missing something. Reload the page and try again.",
  update_failed: "That change didn't save. Check the server log and try again.",
  invite_failed:
    "Supabase couldn't send the invitation. Check the address and the Auth email settings, then try again.",
  link_failed: "We couldn't send that link. Try again in a minute.",
  bad_factory_name: "Give the factory a name.",
  bad_factory_email: "That factory email doesn't look valid.",
  factory_exists: "A factory with that name already exists.",
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string | null {
  const value = params[key];
  return typeof value === "string" && value ? value : null;
}

function banner(params: Record<string, string | string[] | undefined>) {
  const error = readParam(params, "error");
  if (error) return { tone: "error" as const, text: ERROR_COPY[error] ?? ERROR_COPY.bad_request };

  const ok = readParam(params, "ok");
  if (!ok) return null;

  const email = readParam(params, "email") ?? "";
  const factory = readParam(params, "factory") ?? "";
  const warning = readParam(params, "warning") === "profile_incomplete";

  const text =
    ok === "invited"
      ? `Invitation sent to ${email}. They set their password from the email link.`
      : ok === "role_updated"
        ? `Access updated for ${email}.`
        : ok === "disabled"
          ? `${email} is switched off. They are signed out and cannot sign in again.`
          : ok === "enabled"
            ? `${email} can sign in again.`
            : ok === "link_sent"
              ? `Emailed a sign-in link to ${email}.`
              : ok === "factory_created"
                ? `Factory “${factory}” added.`
                : "Saved.";

  return {
    tone: warning ? ("error" as const) : ("ok" as const),
    text: warning
      ? `${text} The account was created but the profile row did not save — set the role again below.`
      : text,
  };
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/* "disabled" wins over everything (the app refuses to give a disabled account a
   role); "invited" means an admin invited them and they never confirmed or
   signed in. Without the service role we can still tell disabled from the rest,
   and an invited-but-unknown account is reported as invited rather than active —
   the friendlier of the two mistakes. */
function accountStatus(
  profile: ProfileRecord,
  auth: AuthAccountStatus | undefined
): { status: "active" | "invited" | "disabled"; note: string } {
  if (profile.disabled_at) {
    return { status: "disabled", note: `Switched off ${formatDate(profile.disabled_at)}` };
  }

  if (auth?.banned) return { status: "disabled", note: "Blocked by Supabase Auth" };

  if (profile.invited_by && !auth?.confirmed && !auth?.lastSignInAt) {
    return { status: "invited", note: "Invitation not accepted yet" };
  }

  return {
    status: "active",
    note: auth?.lastSignInAt ? `Last signed in ${formatDate(auth.lastSignInAt)}` : "Has access",
  };
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-[var(--dcl-lime)] text-black",
  invited: "bg-white text-black ring-2 ring-inset ring-black/20",
  disabled: "bg-red-100 text-red-800",
};

const FIELD_CLASS =
  "mt-1.5 h-11 w-full rounded-2xl border-2 border-zinc-300 bg-white px-3 text-[14px] text-zinc-900 outline-none transition hover:border-zinc-400 focus:border-black focus:ring-4 focus:ring-[var(--dcl-lime)]/50";

const LABEL_CLASS = "block text-[12px] font-bold uppercase tracking-[0.1em] text-zinc-600";

const BUTTON_CLASS =
  "h-11 rounded-full border-[3px] border-black bg-[var(--dcl-lime)] px-5 text-[14px] font-extrabold text-black transition hover:bg-black hover:text-white disabled:opacity-50";

export default async function AccountsPage({ searchParams }: Params) {
  const params = await searchParams;
  const { user: me } = await requireRole(["dcl_admin"], { next: "/admin/accounts" });
  const message = banner(params);

  /* Reads with the caller's own client: RLS lets dcl_staff/dcl_admin read every
     profile (see profiles_select_dcl_team). */
  const supabase = await getServerSupabase();
  const [{ data: profileRows }, { data: factoryRows }] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLUMNS).order("created_at", { ascending: false }).limit(500),
    supabase.from("factories").select("id, name, active").order("name").limit(200),
  ]);

  const accounts = ((profileRows ?? []) as unknown[])
    .map(toProfileRecord)
    .filter((row): row is ProfileRecord => Boolean(row));
  const factories = ((factoryRows ?? []) as unknown[]).map((row) => {
    const value = row as { id: string; name: string; active: boolean };
    return { id: value.id, name: value.name, active: value.active };
  });

  const configured = isServiceRoleConfigured();
  const statuses = configured ? await loadAuthStatuses(getServiceRoleSupabase()) : null;
  const inviterEmail = (id: string | null) =>
    id ? (accounts.find((account) => account.id === id)?.email ?? null) : null;

  return (
    <RoleShell
      badge="DCL admin"
      title={<>Accounts.</>}
      intro={`Invite the team and partner factories, set what each account can do, and switch access off the moment someone leaves. Signed in as ${me.email ?? "you"}.`}
    >
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`mt-6 rounded-2xl border-2 px-4 py-3 text-[14px] font-medium ${
            message.tone === "error"
              ? "border-red-300 bg-red-50 text-red-700"
              : "border-black/15 bg-white text-zinc-800"
          }`}
        >
          {message.text}
        </p>
      )}

      {!configured && (
        <p className="mt-6 rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-[14px] font-medium text-red-700">
          SUPABASE_SERVICE_ROLE_KEY is not set on this environment, so invitations and role changes will fail.
          Add it and redeploy — AUTH_SETUP.md has the exact steps.
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-start">
        <RoleCard title="Invite someone">
          <form action={inviteAccount} className="grid gap-4">
            <div>
              <label className={LABEL_CLASS} htmlFor="invite-email">
                Email
              </label>
              <input
                id="invite-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="off"
                required
                placeholder="teammate@dyecutlab.com"
                className={FIELD_CLASS}
              />
            </div>

            <div>
              <label className={LABEL_CLASS} htmlFor="invite-name">
                Full name (optional)
              </label>
              <input
                id="invite-name"
                name="full_name"
                autoComplete="off"
                maxLength={120}
                placeholder="Gilbert"
                className={FIELD_CLASS}
              />
            </div>

            <div>
              <label className={LABEL_CLASS} htmlFor="invite-role">
                Role
              </label>
              <select id="invite-role" name="role" defaultValue="dcl_staff" className={FIELD_CLASS}>
                <option value="dcl_staff">DCL staff</option>
                <option value="dcl_admin">DCL admin</option>
                <option value="factory">Factory</option>
              </select>
            </div>

            <div>
              <label className={LABEL_CLASS} htmlFor="invite-factory">
                Factory (factory role only)
              </label>
              <select id="invite-factory" name="factory_id" defaultValue="" className={FIELD_CLASS}>
                <option value="">No factory</option>
                {factories.map((factory) => (
                  <option key={factory.id} value={factory.id}>
                    {factory.name}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" className={`${BUTTON_CLASS} h-14 text-[16px]`}>
              Send invitation
            </button>
          </form>

          <p className="text-[13px] text-zinc-600">
            They get an email that lands on our &ldquo;set a password&rdquo; page. If the address already has an
            account, this updates their access instead of sending a second invite — and you can re-send a link
            from their row below.
          </p>
        </RoleCard>

        <RoleCard title="Add a factory" tone="white">
          <form action={createFactory} className="grid gap-4">
            <div>
              <label className={LABEL_CLASS} htmlFor="factory-name">
                Factory name
              </label>
              <input id="factory-name" name="name" required maxLength={120} placeholder="Guangzhou Print Co." className={FIELD_CLASS} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLASS} htmlFor="factory-contact">
                  Contact
                </label>
                <input id="factory-contact" name="contact_name" maxLength={120} className={FIELD_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="factory-phone">
                  Phone
                </label>
                <input id="factory-phone" name="phone" maxLength={40} className={FIELD_CLASS} />
              </div>
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="factory-email">
                Email
              </label>
              <input id="factory-email" name="contact_email" type="email" inputMode="email" maxLength={254} className={FIELD_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="factory-notes">
                Notes (optional)
              </label>
              <input id="factory-notes" name="notes" maxLength={600} className={FIELD_CLASS} />
            </div>
            <button type="submit" className={`${BUTTON_CLASS} h-14 text-[16px]`}>
              Add factory
            </button>
          </form>

          <p className="text-[13px] text-zinc-600">
            Factories are what a &ldquo;factory&rdquo; account belongs to; only the DCL team can see this list.
          </p>
        </RoleCard>
      </div>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[clamp(22px,5.6vw,30px)] font-black tracking-[-0.04em]">
            Accounts <span className="text-zinc-400">({accounts.length})</span>
          </h2>
          <p className="text-[13px] font-medium text-zinc-600">
            Newest first · roles and status live in Supabase, not in the browser
          </p>
        </div>

        {accounts.length === 0 && (
          <p className="mt-5 rounded-[24px] border-2 border-dashed border-black/20 px-4 py-6 text-[14px] font-medium text-zinc-600">
            No accounts yet. The first admin is promoted with SQL — see AUTH_SETUP.md — after that everything
            happens on this page.
          </p>
        )}

        <ul className="mt-5 grid gap-4">
          {accounts.map((account) => {
            const { status, note } = accountStatus(account, statuses?.get(account.id));
            const isMe = account.id === me.id;
            const inviter = inviterEmail(account.invited_by);
            const factoryName = factories.find((factory) => factory.id === account.factory_id)?.name ?? null;

            return (
              <li key={account.id} className="rounded-[24px] border-2 border-black bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all text-[15px] font-extrabold text-black">
                      {account.email ?? "(no email on file)"}
                      {isMe && (
                        <span className="ml-2 rounded-full bg-[var(--dcl-lime)] px-2 py-0.5 align-middle text-[11px] font-extrabold uppercase tracking-wide">
                          You
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[13px] font-medium text-zinc-600">
                      {account.full_name ?? "No name"} · {ROLE_LABELS[account.role]}
                      {factoryName ? ` · ${factoryName}` : ""}
                    </p>
                    <p className="mt-0.5 text-[12px] text-zinc-500">
                      {account.invited_by
                        ? `Invited by ${inviter ?? "another admin"} on ${formatDate(account.created_at)}`
                        : `Signed up ${formatDate(account.created_at)}`}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide ${STATUS_STYLE[status]}`}
                    >
                      {status}
                    </span>
                    <p className="mt-1 text-[12px] text-zinc-500">{note}</p>
                  </div>
                </div>

                {isMe ? (
                  <p className="mt-4 rounded-2xl bg-zinc-100 px-4 py-3 text-[13px] font-medium text-zinc-700">
                    This is you. Your own role and status can only be changed by another admin — that is what
                    stops an accidental lockout.
                  </p>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                      <form action={updateAccount} className="grid gap-3 sm:contents">
                        <input type="hidden" name="user_id" value={account.id} />

                        <div>
                          <label className={LABEL_CLASS} htmlFor={`role-${account.id}`}>
                            Role
                          </label>
                          <select
                            id={`role-${account.id}`}
                            name="role"
                            defaultValue={account.role}
                            className={FIELD_CLASS}
                          >
                            {APP_ROLES.map((value) => (
                              <option key={value} value={value}>
                                {ROLE_LABELS[value]}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className={LABEL_CLASS} htmlFor={`factory-${account.id}`}>
                            Factory (factory role only)
                          </label>
                          <select
                            id={`factory-${account.id}`}
                            name="factory_id"
                            defaultValue={account.factory_id ?? ""}
                            className={FIELD_CLASS}
                          >
                            <option value="">No factory</option>
                            {factories.map((factory) => (
                              <option key={factory.id} value={factory.id}>
                                {factory.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button type="submit" className={BUTTON_CLASS}>
                          Save
                        </button>
                      </form>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <form action={setAccountActive}>
                        <input type="hidden" name="user_id" value={account.id} />
                        <input type="hidden" name="disabled" value={status === "disabled" ? "false" : "true"} />
                        <button
                          type="submit"
                          className="h-11 rounded-full border-2 border-black bg-white px-4 text-[13px] font-extrabold transition hover:bg-black hover:text-white"
                        >
                          {status === "disabled" ? "Switch access back on" : "Switch access off"}
                        </button>
                      </form>

                      <form action={sendSignInLink}>
                        <input type="hidden" name="email" value={account.email ?? ""} />
                        <button
                          type="submit"
                          disabled={!account.email}
                          className="h-11 rounded-full border-2 border-black bg-white px-4 text-[13px] font-extrabold transition hover:bg-black hover:text-white disabled:opacity-50"
                        >
                          Email a sign-in link
                        </button>
                      </form>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </RoleShell>
  );
}

