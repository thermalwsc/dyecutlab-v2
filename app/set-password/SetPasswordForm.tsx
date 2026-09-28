"use client";

import { useState } from "react";
import { getBrowserSupabase } from "../../lib/supabase/browser";
import { ArrowIcon } from "../updates/Icons";

/* Password form used by both email flows on /set-password (invite acceptance
   and password reset). The page only renders it when there is a real session,
   so updateUser() has an account to write to. */

const MIN_PASSWORD_LENGTH = 8;

export default function SetPasswordForm({ email }: { email: string | null }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }

    setError(null);
    setBusy(true);
    const { error: updateError } = await getBrowserSupabase().auth.updateUser({ password });

    if (updateError) {
      console.error("SET PASSWORD ERROR:", updateError.message);
      setBusy(false);
      setError(
        updateError.status === 429
          ? "Too many attempts just now. Wait a minute and try again."
          : "We couldn't save that password. The link may have expired — request a new one from the sign-in page."
      );
      return;
    }

    setSaving(true);
    window.location.assign(await landingPath());
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="rounded-[28px] bg-[var(--dcl-lime-soft)] p-5 sm:rounded-[32px] sm:p-8"
    >
      {email && (
        <p className="text-[13px] font-bold text-zinc-700">
          Account: <span className="break-all font-extrabold text-black">{email}</span>
        </p>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="new-password" className="block text-[13px] font-bold text-zinc-900">
            New password
          </label>
          <div className="relative">
            <input
              id="new-password"
              name="new-password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              minLength={MIN_PASSWORD_LENGTH}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError(null);
              }}
              aria-describedby={error ? "set-password-error" : "new-password-hint"}
              className="mt-1.5 h-12 w-full rounded-2xl border-2 border-zinc-300 bg-white pl-4 pr-20 text-[15px] text-zinc-900 outline-none transition hover:border-zinc-400 focus:border-black focus:ring-4 focus:ring-[var(--dcl-lime)]/50"
            />
            <button
              type="button"
              onClick={() => setShow((current) => !current)}
              aria-pressed={show}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 mt-[3px] -translate-y-1/2 rounded-full px-3 py-2 text-[12px] font-extrabold uppercase tracking-wide text-zinc-700 transition hover:bg-[var(--dcl-lime-soft)] hover:text-black"
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
          <p id="new-password-hint" className="mt-1.5 text-[12px] font-medium text-zinc-600">
            {MIN_PASSWORD_LENGTH}+ characters. A phrase you&rsquo;ll remember beats a short scramble.
          </p>
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-[13px] font-bold text-zinc-900">
            Confirm password
          </label>
          <input
            id="confirm-password"
            name="confirm-password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            minLength={MIN_PASSWORD_LENGTH}
            onChange={(event) => {
              setConfirm(event.target.value);
              if (error) setError(null);
            }}
            className="mt-1.5 h-12 w-full rounded-2xl border-2 border-zinc-300 bg-white px-4 text-[15px] text-zinc-900 outline-none transition hover:border-zinc-400 focus:border-black focus:ring-4 focus:ring-[var(--dcl-lime)]/50"
          />
        </div>
      </div>

      {error && (
        <p
          id="set-password-error"
          role="alert"
          className="mt-3 rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="group mt-5 flex h-14 w-full items-center justify-between rounded-full bg-[#0a0a0a] pl-7 pr-6 text-[16px] font-extrabold text-white transition hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-60"
      >
        <span>{saving ? "Taking you in…" : busy ? "Saving…" : "Save password and continue"}</span>
        <ArrowIcon className="h-5 w-5 text-[var(--dcl-lime)] transition-transform group-hover:translate-x-1" />
      </button>
    </form>
  );
}

/* Same server-side role decision as the sign-in card. */
async function landingPath(): Promise<string> {
  try {
    const res = await fetch("/api/auth/home", { cache: "no-store" });
    if (res.ok) {
      const body: { path?: unknown } = await res.json();
      if (typeof body.path === "string" && body.path.startsWith("/")) return body.path;
    }
  } catch {
    /* fall through */
  }
  return "/account";
}
