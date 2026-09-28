"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "../../lib/supabase/browser";
import { ArrowIcon, Burst, Sparkle } from "../updates/Icons";

type Provider = "google" | "apple";

const ERRORS: Record<string, string> = {
  signin_failed: "That sign-in didn't go through. Please try again.",
};

export default function SignInCard({ next, error }: { next: string; error: string | null }) {
  const [busy, setBusy] = useState<Provider | "email" | null>(null);
  const [message, setMessage] = useState<string | null>(error ? ERRORS[error] ?? ERRORS.signin_failed : null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  /* Which providers are switched on in Supabase. null = still checking;
     a provider that is off shows "coming soon" instead of a broken page. */
  const [enabled, setEnabled] = useState<Record<Provider, boolean> | null>(null);

  useEffect(() => {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`;
    fetch(url, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! } })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((settings: { external?: Record<string, boolean> }) =>
        setEnabled({ google: Boolean(settings.external?.google), apple: Boolean(settings.external?.apple) })
      )
      /* If the check itself fails, let people try; errors are handled on click. */
      .catch(() => setEnabled({ google: true, apple: true }));
  }, []);

  function providerLabel(provider: Provider) {
    const name = provider === "google" ? "Google" : "Apple";
    if (busy === provider) return `Opening ${name}…`;
    if (enabled && !enabled[provider]) {
      return (
        <>
          {name}
          <span className="rounded-full bg-[var(--dcl-lime)] px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-black">
            Coming soon
          </span>
        </>
      );
    }
    return `Continue with ${name}`;
  }

  function callbackUrl() {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async function withProvider(provider: Provider) {
    setBusy(provider);
    setMessage(null);
    const { error } = await getBrowserSupabase().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() },
    });
    /* On success the browser is already leaving for Google / Apple. */
    if (error) {
      console.error("OAUTH START ERROR:", error.message);
      setMessage(
        `${provider === "google" ? "Google" : "Apple"} sign-in isn't available right now. Try another option.`
      );
      setBusy(null);
    }
  }

  async function withEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(value)) {
      setEmailError("Enter a valid email address, like you@brand.com.");
      return;
    }
    setEmailError(null);
    setMessage(null);
    setBusy("email");
    const { error } = await getBrowserSupabase().auth.signInWithOtp({
      email: value,
      options: { emailRedirectTo: callbackUrl() },
    });
    setBusy(null);
    if (error) {
      console.error("EMAIL LINK ERROR:", error.message);
      setMessage(
        error.status === 429
          ? "Too many sign-in emails just now. Wait a minute and try again."
          : "We couldn't send the sign-in email. Please try again."
      );
      return;
    }
    setSentTo(value);
  }

  if (sentTo) {
    return (
      <div role="status" aria-live="polite" className="rounded-[28px] bg-[var(--dcl-lime-soft)] p-6 sm:rounded-[32px] sm:p-8">
        <span className="inline-block rounded-full bg-[var(--dcl-lime)] px-3 py-1 text-[12px] font-extrabold">Check your inbox</span>
        <h2 className="mt-4 text-[clamp(26px,7vw,34px)] font-black leading-[1.05] tracking-[-0.04em]">We sent you a sign-in link.</h2>
        <p className="mt-3 text-[15px] font-medium leading-relaxed text-zinc-800">
          Open the email we sent to <span className="font-extrabold text-black">{sentTo}</span> and tap the link to sign in. It
          expires in an hour. Check spam if you don&rsquo;t see it.
        </p>
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className="mt-6 h-12 rounded-full border-[3px] border-black bg-white px-6 text-[15px] font-extrabold transition hover:bg-black hover:text-white"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="relative rounded-[28px] bg-[var(--dcl-lime-soft)] p-5 sm:rounded-[32px] sm:p-8">
      <Sparkle className="absolute -top-3 right-8 h-6 w-6 text-[var(--dcl-lime-deep)]" />

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => withProvider("google")}
          disabled={busy !== null || !enabled?.google}
          className="flex h-14 w-full items-center justify-center gap-3 rounded-full border-[3px] border-black bg-white px-6 text-[16px] font-extrabold text-black transition hover:bg-zinc-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <GoogleLogo className="h-5 w-5 shrink-0" />
          {providerLabel("google")}
        </button>

        <button
          type="button"
          onClick={() => withProvider("apple")}
          disabled={busy !== null || !enabled?.apple}
          className="flex h-14 w-full items-center justify-center gap-3 rounded-full border-[3px] border-black bg-black px-6 text-[16px] font-extrabold text-white transition hover:bg-zinc-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <AppleLogo className="h-5 w-5 shrink-0" />
          {providerLabel("apple")}
        </button>
      </div>

      <div className="my-6 flex items-center gap-3 text-[12px] font-bold uppercase tracking-[0.14em] text-zinc-500" aria-hidden="true">
        <span className="h-0.5 flex-1 rounded bg-black/10" />
        or use email
        <span className="h-0.5 flex-1 rounded bg-black/10" />
      </div>

      <form onSubmit={withEmail} noValidate className="space-y-3">
        <div>
          <label htmlFor="signin-email" className="block text-[13px] font-bold text-zinc-900">
            Email
          </label>
          <input
            id="signin-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (emailError) setEmailError(null);
            }}
            placeholder="you@brand.com"
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? "signin-email-error" : undefined}
            className={`mt-1.5 h-12 w-full rounded-2xl border-2 bg-white px-4 text-[15px] text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-black focus:ring-4 focus:ring-[var(--dcl-lime)]/50 ${
              emailError ? "border-red-400" : "border-zinc-300 hover:border-zinc-400"
            }`}
          />
          {emailError && (
            <p id="signin-email-error" className="mt-1.5 text-[12px] font-medium text-red-600">
              {emailError}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={busy !== null}
          className="group flex h-14 w-full items-center justify-between rounded-full bg-[#0a0a0a] pl-7 pr-6 text-[16px] font-extrabold text-white transition hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-60"
        >
          <span>{busy === "email" ? "Sending link…" : "Email me a sign-in link"}</span>
          <ArrowIcon className="h-5 w-5 text-[var(--dcl-lime)] transition-transform group-hover:translate-x-1" />
        </button>
      </form>

      {message && (
        <p role="alert" className="mt-4 rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
          {message}
        </p>
      )}

      <p className="mt-5 text-center text-[12px] leading-relaxed text-zinc-600">
        No password needed. New here? Signing in creates your account. By continuing you agree to our{" "}
        <Link href="/terms" className="font-bold text-black underline underline-offset-2">Terms</Link> and{" "}
        <Link href="/privacy" className="font-bold text-black underline underline-offset-2">Privacy Policy</Link>.
      </p>

      <Burst className="pointer-events-none absolute -left-3 -top-4 h-8 w-8 -scale-x-100 text-[var(--dcl-lime-deep)]" />
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
