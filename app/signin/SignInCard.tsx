"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "../../lib/supabase/browser";
import { ArrowIcon, Burst, Sparkle } from "../updates/Icons";

/* Sign in / create account card.

   Email + password is the main path; Google and Apple sit above it. Passwords
   never touch our server: signUp / signInWithPassword / resetPasswordForEmail
   go straight from the browser to Supabase Auth, and only the resulting session
   cookie comes back. A provider that isn't switched on in Supabase shows as a
   disabled button with a one-line explanation — visible, but never a dead end. */

const PROVIDERS = ["google", "apple"] as const;
type Provider = (typeof PROVIDERS)[number];

const PROVIDER_LABELS: Record<Provider, string> = { google: "Google", apple: "Apple" };

type Mode = "signin" | "signup" | "forgot";
type Busy = "password" | Provider | "reset" | null;
type Notice = { tone: "error" | "info"; title?: string; body: string };

/* Must match the Auth server's minimum (Supabase default is 6). */
const MIN_PASSWORD_LENGTH = 8;

/* Reasons we come back with ?error=… (from the OAuth callback or the guards). */
const URL_ERRORS: Record<string, string> = {
  account_disabled: "That account has been switched off. If that looks wrong, contact DYE CUT LAB.",
  signin_failed: "That sign-in didn't go through. Please try again.",
  link_expired: "That link has expired or was already used. Request a new one below.",
  oauth_cancelled: "That sign-in was cancelled. Use your email and password instead.",
};

const MIN_COPY = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;

function emailLooksValid(value: string) {
  return /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(value);
}

/* "Google and Apple sign-in aren't switched on yet — use your email and
   password." Empty string while the check is still running. */
function offProviderNote(providers: Record<Provider, boolean> | null): string {
  if (!providers) return "";

  const off = PROVIDERS.filter((provider) => !providers[provider]);
  if (off.length === 0) return "";

  const names = off.map((provider) => PROVIDER_LABELS[provider]);
  const list =
    names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];

  return `${list} sign-in ${off.length > 1 ? "aren't" : "isn't"} switched on yet — use your email and password.`;
}

function signInErrorMessage(error: { status?: number; code?: string }): string {
  switch (error.code) {
    case "invalid_credentials":
      return "That email and password don't match an account. Check both, or reset your password.";
    case "email_not_confirmed":
      return "Confirm your email first — we sent you a link when you signed up.";
    case "user_banned":
      return URL_ERRORS.account_disabled;
    default:
      return error.status === 429
        ? "Too many attempts just now. Wait a minute and try again."
        : URL_ERRORS.signin_failed;
  }
}

function signUpErrorMessage(error: { status?: number; code?: string }): string {
  switch (error.code) {
    case "user_already_exists":
    case "email_exists":
      return "An account already exists for that email. Sign in instead, or reset the password.";
    case "weak_password":
      return "That password is too easy to guess. Try a longer one.";
    case "email_address_invalid":
      return "That email address doesn't look valid.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many sign-ups from here just now. Wait a few minutes and try again.";
    default:
      return error.status === 429
        ? "Too many attempts just now. Wait a minute and try again."
        : "We couldn't create that account. Please try again.";
  }
}

export default function SignInCard({ next, error }: { next: string; error: string | null }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState<Busy>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(
    error ? { tone: "error", body: URL_ERRORS[error] ?? URL_ERRORS.signin_failed } : null
  );
  /* "Invalid login credentials" is what Supabase answers with for an account
     that has no password yet (an old email-link sign-up, a Google account, or
     an invite nobody accepted) as well as for a genuinely wrong password — the
     same answer either way, on purpose. Offer the reset link right there. */
  const [suggestReset, setSuggestReset] = useState(false);
  /* null = still checking; a false value means the provider is off in Supabase,
     so the button shows disabled instead of failing on click. */
  const [providers, setProviders] = useState<Record<Provider, boolean> | null>(null);

  useEffect(() => {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`;
    fetch(url, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! } })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((settings: { external?: Partial<Record<Provider, boolean>> }) => {
        setProviders({
          google: Boolean(settings.external?.google),
          apple: Boolean(settings.external?.apple),
        });
      })
      /* If the check fails, let people try — a real failure is reported on click. */
      .catch(() => setProviders({ google: true, apple: true }));
  }, []);

  function callbackUrl() {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  function switchMode(value: Mode) {
    setMode(value);
    setPassword("");
    setConfirm("");
    setFieldError(null);
    setNotice(null);
    setSuggestReset(false);
  }

  /* The server decides where this account should land (role-aware, and it signs
     a switched-off account back out). Falls back to `next`, which the page
     already sanitised. */
  async function goToLanding() {
    try {
      const res = await fetch(`/api/auth/home?next=${encodeURIComponent(next)}`, { cache: "no-store" });
      if (res.ok) {
        const body: { path?: unknown } = await res.json();
        if (typeof body.path === "string" && body.path.startsWith("/")) {
          window.location.assign(body.path);
          return;
        }
      }
    } catch {
      /* fall through to `next` */
    }
    window.location.assign(next);
  }

  async function withProvider(provider: Provider) {
    const name = PROVIDER_LABELS[provider];
    setBusy(provider);
    setNotice(null);
    const { error: oauthError } = await getBrowserSupabase().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() },
    });
    /* On success the browser is already leaving for Google / Apple. */
    if (oauthError) {
      console.error("OAUTH START ERROR:", oauthError.message);
      setNotice({
        tone: "error",
        body: `${name} sign-in isn't available right now. Use your email and password.`,
      });
      setBusy(null);
    }
  }

  async function sendReset(address: string) {
    setBusy("reset");
    const { error: resetError } = await getBrowserSupabase().auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/set-password`,
    });
    setBusy(null);

    if (resetError && resetError.status === 429) {
      setNotice({ tone: "error", body: "Too many emails just now. Wait a few minutes and try again." });
      return;
    }

    /* Always the same answer: this form must not reveal which emails have
       accounts. Real failures only go to the server log. */
    if (resetError) console.error("RESET EMAIL ERROR:", resetError.message);
    setNotice({
      tone: "info",
      title: "Check your inbox",
      body: `If an account exists for ${address}, we've sent a link to set a new password. It expires in an hour.`,
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim().toLowerCase();

    if (!emailLooksValid(address)) {
      setFieldError("Enter a valid email address, like you@brand.com.");
      return;
    }
    if (mode !== "forgot" && password.length < MIN_PASSWORD_LENGTH) {
      setFieldError(MIN_COPY);
      return;
    }
    if (mode === "signup" && password !== confirm) {
      setFieldError("Those two passwords don't match.");
      return;
    }

    setFieldError(null);
    setNotice(null);
    setBusy("password");

    const supabase = getBrowserSupabase();

    if (mode === "forgot") {
      await sendReset(address);
      return;
    }

    if (mode === "signin") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: address, password });
      if (signInError) {
        console.error("PASSWORD SIGN-IN ERROR:", signInError.message);
        setBusy(null);
        setSuggestReset(signInError.code === "invalid_credentials");
        setNotice({ tone: "error", body: signInErrorMessage(signInError) });
        return;
      }
      await goToLanding();
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: address,
      password,
      options: { emailRedirectTo: callbackUrl() },
    });

    if (signUpError) {
      console.error("SIGN-UP ERROR:", signUpError.message);
      setBusy(null);
      setNotice({ tone: "error", body: signUpErrorMessage(signUpError) });
      return;
    }

    /* With email confirmation turned off Supabase returns a session at once. */
    if (data.session) {
      await goToLanding();
      return;
    }

    /* Confirmation on: an existing account is answered with a decoy user that
       has no identities, so treat that as "already registered" too. */
    if (data.user && data.user.identities?.length === 0) {
      setBusy(null);
      setNotice({
        tone: "error",
        body: "An account already exists for that email. Sign in instead, or reset the password.",
      });
      return;
    }

    setBusy(null);
    setNotice({
      tone: "info",
      title: "Check your inbox",
      body: `We sent a confirmation link to ${address}. Open it to finish setting up your account — check spam if it isn't there in a minute.`,
    });
  }

  const disabled = busy !== null;
  const tabs: { value: Mode; label: string }[] = [
    { value: "signin", label: "Sign in" },
    { value: "signup", label: "Create account" },
  ];
  const submitLabel =
    mode === "forgot"
      ? busy === "reset"
        ? "Sending link…"
        : "Email me a reset link"
      : mode === "signin"
        ? busy === "password"
          ? "Signing in…"
          : "Sign in"
        : busy === "password"
          ? "Creating your account…"
          : "Create account";

  return (
    <div className="relative rounded-[28px] bg-[var(--dcl-lime-soft)] p-5 sm:rounded-[32px] sm:p-8">
      <Sparkle className="absolute -top-3 right-8 h-6 w-6 text-[var(--dcl-lime-deep)]" />

      {mode === "forgot" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[20px] font-black tracking-[-0.03em]">Reset your password</h2>
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className="text-[13px] font-extrabold underline underline-offset-2"
          >
            Back to sign in
          </button>
        </div>
      ) : (
        <div className="flex gap-1 rounded-full border-[3px] border-black bg-white p-1">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => switchMode(tab.value)}
              aria-pressed={mode === tab.value}
              className={`flex-1 rounded-full px-3 py-2.5 text-[14px] font-extrabold transition ${
                mode === tab.value
                  ? "bg-[#0a0a0a] text-white"
                  : "text-zinc-700 hover:bg-[var(--dcl-lime-soft)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {mode !== "forgot" && (
        <>
          <div className="mt-4 grid gap-2.5">
            {PROVIDERS.map((provider) => {
              const on = providers === null || providers[provider];
              const Logo = provider === "google" ? GoogleLogo : AppleLogo;

              return (
                <button
                  key={provider}
                  type="button"
                  onClick={() => withProvider(provider)}
                  disabled={disabled || !on}
                  className={
                    provider === "google"
                      ? "flex h-14 w-full items-center justify-center gap-3 rounded-full border-[3px] border-black bg-white px-6 text-[16px] font-extrabold text-black transition hover:bg-zinc-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                      : "flex h-14 w-full items-center justify-center gap-3 rounded-full bg-[#0a0a0a] px-6 text-[16px] font-extrabold text-white transition hover:bg-zinc-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                  }
                >
                  <Logo
                    className={provider === "google" ? "h-5 w-5 shrink-0" : "h-6 w-6 shrink-0 text-white"}
                  />
                  {busy === provider
                    ? `Opening ${PROVIDER_LABELS[provider]}…`
                    : `Continue with ${PROVIDER_LABELS[provider]}`}
                </button>
              );
            })}
          </div>

          {offProviderNote(providers) && (
            <p className="mt-2 text-center text-[12px] font-medium text-zinc-600">
              {offProviderNote(providers)}
            </p>
          )}

          <div
            className="my-5 flex items-center gap-3 text-[12px] font-bold uppercase tracking-[0.14em] text-zinc-500"
            aria-hidden="true"
          >
            <span className="h-0.5 flex-1 rounded bg-black/10" />
            or use email
            <span className="h-0.5 flex-1 rounded bg-black/10" />
          </div>
        </>
      )}

      <form
        onSubmit={submit}
        noValidate
        className={`space-y-3 ${mode === "forgot" ? "mt-5" : ""}`}
      >
        <div>
          <label htmlFor="auth-email" className="block text-[13px] font-bold text-zinc-900">
            Email
          </label>
          <input
            id="auth-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (fieldError) setFieldError(null);
            }}
            placeholder="you@brand.com"
            aria-describedby={fieldError ? "auth-field-error" : undefined}
            className="mt-1.5 h-12 w-full rounded-2xl border-2 border-zinc-300 bg-white px-4 text-[15px] text-zinc-900 outline-none transition placeholder:text-zinc-400 hover:border-zinc-400 focus:border-black focus:ring-4 focus:ring-[var(--dcl-lime)]/50"
          />
        </div>

        {mode !== "forgot" && (
          <PasswordInput
            id="auth-password"
            label="Password"
            value={password}
            onChange={(value) => {
              setPassword(value);
              if (fieldError) setFieldError(null);
            }}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            hint={
              mode === "signup"
                ? `${MIN_PASSWORD_LENGTH}+ characters. A phrase you'll remember beats a short scramble.`
                : undefined
            }
          />
        )}

        {mode === "signup" && (
          <PasswordInput
            id="auth-confirm"
            label="Confirm password"
            value={confirm}
            onChange={(value) => {
              setConfirm(value);
              if (fieldError) setFieldError(null);
            }}
            autoComplete="new-password"
          />
        )}

        {mode === "signin" && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              className="text-[13px] font-extrabold text-zinc-800 underline underline-offset-2 hover:text-black"
            >
              Forgot your password?
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={disabled}
          className="group flex h-14 w-full items-center justify-between rounded-full bg-[#0a0a0a] pl-7 pr-6 text-[16px] font-extrabold text-white transition hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-60"
        >
          <span>{submitLabel}</span>
          <ArrowIcon className="h-5 w-5 text-[var(--dcl-lime)] transition-transform group-hover:translate-x-1" />
        </button>
      </form>

      {fieldError && (
        <p
          id="auth-field-error"
          role="alert"
          className="mt-3 rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700"
        >
          {fieldError}
        </p>
      )}

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mt-3 rounded-2xl border-2 px-4 py-3 text-[13px] font-medium ${
            notice.tone === "error"
              ? "border-red-300 bg-red-50 text-red-700"
              : "border-black/15 bg-white text-zinc-800"
          }`}
        >
          {notice.title && <p className="mb-1 text-[14px] font-extrabold text-black">{notice.title}</p>}
          {notice.body}

          {suggestReset && (
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              className="mt-2 font-extrabold text-black underline underline-offset-2"
            >
              Email me a password reset link instead
            </button>
          )}
        </div>
      )}

      <p className="mt-5 text-center text-[12px] leading-relaxed text-zinc-600">
        {mode === "signup" ? (
          <>
            Creating an account is free. By continuing you agree to our{" "}
            <Link href="/terms" className="font-bold text-black underline underline-offset-2">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-bold text-black underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </>
        ) : (
          <>
            Password sign-in is new. If you used email links before, tap{" "}
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              className="font-bold text-black underline underline-offset-2"
            >
              Forgot your password?
            </button>{" "}
            once to set one.
          </>
        )}
      </p>

      <Burst className="pointer-events-none absolute -left-3 -top-4 h-8 w-8 -scale-x-100 text-[var(--dcl-lime-deep)]" />
    </div>
  );
}

/* Password field with its own show/hide toggle. Every field is opt-in visible:
   typing a long password twice on a phone is where sign-ups get abandoned. */
function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-bold text-zinc-900">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          minLength={MIN_PASSWORD_LENGTH}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="mt-1.5 h-12 w-full rounded-2xl border-2 border-zinc-300 bg-white pl-4 pr-20 text-[15px] text-zinc-900 outline-none transition hover:border-zinc-400 focus:border-black focus:ring-4 focus:ring-[var(--dcl-lime)]/50"
        />
        <button
          type="button"
          onClick={() => setShow((current) => !current)}
          aria-pressed={show}
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute right-2 top-1/2 mt-[3px] -translate-y-1/2 rounded-full px-3 py-2 text-[12px] font-extrabold uppercase tracking-wide text-zinc-700 transition hover:bg-[var(--dcl-lime-soft)] hover:text-black"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-[12px] font-medium text-zinc-600">
          {hint}
        </p>
      )}
    </div>
  );
}

/* Google's standard multi-color "G" (brand guidelines require it unaltered). */
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M16.37 12.7c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.78.74 2.99.72 1.24-.02 2.02-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.39-.92-2.4-3.69zM14.1 5.94c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.28z" />
    </svg>
  );
}
