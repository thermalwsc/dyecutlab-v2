"use client";

import { useState } from "react";
import HeroVisual from "./HeroVisual";

import {
  SMS_CONSENT_COPY,
  validateSignup,
  type SignupErrors,
} from "../../lib/subscribers";
import { DEFAULT_COUNTRY, type Country } from "../../lib/countries";
import PhoneField from "./PhoneField";

type ChannelStatus = "sent" | "skipped" | "failed";

type SignupResponse = {
  ok?: boolean;
  alreadySubscribed?: boolean;
  channels?: {
    email?: { status?: ChannelStatus };
    sms?: { status?: ChannelStatus };
  };
  error?: string;
  errors?: SignupErrors;
};

type Confirmation = {
  alreadySubscribed: boolean;
  email: string | null;
  phone: string | null;
  emailStatus: ChannelStatus | null;
  smsStatus: ChannelStatus | null;
};

const EMPTY_FORM = { name: "", email: "", phone: "" };

/* Combine the selected country dial code with the locally-entered number
   into the full international value the existing backend expects
   (e.g. "+63" + "917 555 0123" -> "+639175550123"). Avoids duplicating
   the dial code when the user pastes a full international number. */
function buildFullPhone(dial: string, local: string) {
  const trimmed = local.trim();
  if (!trimmed) return "";
  // User pasted a full international number — keep it as-is.
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, "");
  const dialDigits = dial.replace("+", "");
  // User included the dial code without "+" (e.g. "63917...").
  if (digits.startsWith(dialDigits)) return `+${digits}`;
  // Strip domestic trunk zero ("0917..." -> "917...") before prefixing.
  const withoutTrunk = digits.replace(/^0+/, "");
  return `${dial} ${withoutTrunk}`;
}

export default function SignupForm() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [localPhone, setLocalPhone] = useState("");
  const [errors, setErrors] = useState<SignupErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  function update(field: keyof typeof EMPTY_FORM, value: string) {
    // The phone field renders as country selector + local number; keep
    // `form.phone` as the full international value the API already expects.
    if (field === "phone") {
      setLocalPhone(value);
      const full = buildFullPhone(country.dial, value);
      setForm((current) => ({ ...current, phone: full }));
      return;
    }
    setForm((current) => ({ ...current, [field]: value }));
  }

  function selectCountry(next: Country) {
    setCountry(next);
    // Preserve the entered local number; just re-prefix with the new dial.
    const full = buildFullPhone(next.dial, localPhone);
    setForm((current) => ({ ...current, phone: full }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    /* The same rules run here and on the server, so the visitor gets an
       inline message before any network call. */
    const validation = validateSignup(form);

    if (!validation.ok) {
      setErrors(validation.errors);
      setFormError(null);
      return;
    }

    setErrors({});
    setFormError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/subscribers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });

      const payload = (await response
        .json()
        .catch(() => null)) as SignupResponse | null;

      if (!response.ok) {
        if (payload?.errors) setErrors(payload.errors);

        setFormError(
          payload?.error ?? "Something went wrong. Please try again."
        );
        return;
      }

      setConfirmation({
        alreadySubscribed: Boolean(payload?.alreadySubscribed),
        email: validation.value.email,
        phone: validation.value.phone,
        emailStatus: payload?.channels?.email?.status ?? null,
        smsStatus: payload?.channels?.sms?.status ?? null,
      });
    } catch (error) {
      console.error("SUBSCRIBER SIGNUP ERROR:", error);

      setFormError(
        "We couldn't reach the server. Check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setForm(EMPTY_FORM);
    setCountry(DEFAULT_COUNTRY);
    setLocalPhone("");
    setErrors({});
    setFormError(null);
    setConfirmation(null);
  }

  return (
    <main className="min-h-screen bg-[#fdfdfc] font-sans text-[#0a0a0a] antialiased">
      {/* HEADER — clean SaaS horizontal header with subtle bottom border and neon green status dot */}
      <header className="border-b border-zinc-200/80 bg-white/70 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
          <Logo />

          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#a3e635] shadow-[0_0_8px_#a3e635]" />
            <p className="font-mono text-[10px] font-semibold tracking-[0.24em] text-zinc-900 uppercase">
              PRODUCT UPDATES
            </p>
          </div>
        </div>
      </header>

      {/* MAIN TWO-COLUMN SaaS HERO */}
      <section className="mx-auto w-full max-w-[1440px] px-5 pb-16 pt-8 sm:px-8 sm:pt-12 lg:px-12 lg:pb-24 lg:pt-14">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12 lg:gap-10 xl:gap-16">
          {/* LEFT SIDE: ~43% (5 cols on lg) */}
          <div className="dcl-rise flex flex-col lg:col-span-5">
            <div>
              <StatusPill />
            </div>

            <h1 className="mt-5 font-sans text-[44px] font-extrabold leading-[1.02] tracking-[-0.035em] text-zinc-950 sm:text-[56px] lg:text-[62px]">
              GET PRODUCT
              <br />
              UPDATES <span className="text-[#a3e635]">FIRST.</span>
            </h1>

            <p className="mt-4 max-w-[460px] text-[15px] leading-relaxed text-zinc-600 sm:text-[16px]">
              Early access, new packaging drops and DICI feature releases from
              DYE CUT LAB — straight to your inbox or phone.
            </p>

            <BenefitsRow />

            {/* Mobile visual position: in mobile, shows right after benefits */}
            <div className="mt-10 block lg:hidden">
              <HeroVisual />
            </div>

            <div className="mt-10">
              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-[#a3e635]" />
                <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-zinc-900 uppercase">
                  SIGN UP
                </span>
                <div className="h-px flex-1 bg-zinc-200" />
              </div>

              <p className="mt-2 text-[13px] text-zinc-500">
                Add an email address, a mobile number, or both.
              </p>

              {confirmation ? (
                <Confirmation confirmation={confirmation} onReset={reset} />
              ) : (
                <form className="mt-6 space-y-4" onSubmit={submit} noValidate>

                  {/* Name Input */}
                  <div>
                    <label
                      htmlFor="subscriber-name"
                      className="block text-[11px] font-mono tracking-[0.16em] text-zinc-500 uppercase"
                    >
                      NAME <span className="text-zinc-400 font-normal">OPTIONAL</span>
                    </label>

                    <div className="relative mt-1.5 flex items-center">
                      <span className="pointer-events-none absolute left-3.5 text-zinc-400">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </span>

                      <input
                        id="subscriber-name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        value={form.name}
                        onChange={(event) => update("name", event.target.value)}
                        placeholder="Alex"
                        aria-invalid={Boolean(errors.name)}
                        className={`h-12 w-full rounded-2xl border bg-white pl-10 pr-4 text-[14px] text-zinc-900 outline-none transition-all placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/5 ${
                          errors.name
                            ? "border-red-400 ring-2 ring-red-400/10"
                            : "border-zinc-200 hover:border-zinc-300"
                        }`}
                      />
                    </div>

                    {errors.name && (
                      <p className="mt-1.5 text-[11px] text-red-500">{errors.name}</p>
                    )}
                  </div>

                  {/* Email Input */}
                  <div>
                    <label
                      htmlFor="subscriber-email"
                      className="block text-[11px] font-mono tracking-[0.16em] text-zinc-500 uppercase"
                    >
                      EMAIL <span className="text-zinc-400 font-normal">OPTIONAL</span>
                    </label>

                    <div className="relative mt-1.5 flex items-center">
                      <span className="pointer-events-none absolute left-3.5 text-zinc-400">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                      </span>

                      <input
                        id="subscriber-email"
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        value={form.email}
                        onChange={(event) => update("email", event.target.value)}
                        placeholder="you@brand.com"
                        aria-invalid={Boolean(errors.email)}
                        className={`h-12 w-full rounded-2xl border bg-white pl-10 pr-4 text-[14px] text-zinc-900 outline-none transition-all placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/5 ${
                          errors.email
                            ? "border-red-400 ring-2 ring-red-400/10"
                            : "border-zinc-200 hover:border-zinc-300"
                        }`}
                      />
                    </div>

                    {errors.email && (
                      <p className="mt-1.5 text-[11px] text-red-500">{errors.email}</p>
                    )}
                  </div>

                  {/* Mobile Input — country selector + local number */}
                  <PhoneField
                    country={country}
                    localPhone={localPhone}
                    error={errors.phone}
                    onLocalChange={(value) => update("phone", value)}
                    onSelectCountry={selectCountry}
                    onClearError={() =>
                      setErrors((current) =>
                        current.phone ? { ...current, phone: undefined } : current
                      )
                    }
                  />


                  <p id="subscriber-sms-consent" className="mt-1 text-[11px] leading-relaxed text-zinc-500">{SMS_CONSENT_COPY}</p>

                  {(errors.form || formError) && (
                    <p
                      role="alert"
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[11px] leading-4 text-red-600"
                    >
                      {errors.form ?? formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="group mt-6 flex h-12 w-full items-center justify-between rounded-full bg-[#0a0a0d] px-6 text-[12px] font-bold tracking-[0.1em] text-white transition-all duration-150 hover:bg-zinc-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
                  >
                    <span>{submitting ? "SIGNING UP..." : "GET EARLY ACCESS"}</span>
                    <span
                      className="text-[16px] text-[#a3e635] transition-transform duration-200 group-hover:translate-x-1"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  </button>

                  <p className="mt-4 text-[11px] leading-relaxed text-zinc-400 text-center">
                    We only send the updates you ask for. Unsubscribe any time — reply
                    STOP to any text, or reply to any email.
                  </p>
                </form>
              )}
            </div>
          </div>

          {/* RIGHT SIDE: ~57% (7 cols on lg) — large SaaS Dashboard Preview */}
          <div className="hidden lg:block lg:col-span-7 lg:sticky lg:top-24">
            <HeroVisual />
          </div>
        </div>
      </section>

      {/* FOOTER BANNER */}
      <DarkFooterBanner />
    </main>
  );
}

/* Same wordmark markup as app/page.tsx — kept local so the DICI flow in
   app/page.tsx stays untouched. */
function Logo() {
  return (
    <div className="text-[20px] font-black leading-[0.8] tracking-[-0.06em]">
      DYE CUT
      <br />
      LAB
    </div>
  );
}

function StatusPill() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200/90 bg-white px-3.5 py-1.5 shadow-2xs">
      <span className="h-2 w-2 rounded-full bg-[#a3e635] shadow-[0_0_8px_#a3e635]" />
      <span className="font-sans text-[11px] font-bold tracking-tight text-zinc-900">
        DICI
      </span>
      <span className="text-[10px] text-zinc-300" aria-hidden="true">
        /
      </span>
      <span className="font-sans text-[11px] font-semibold tracking-tight text-zinc-500">
        EARLY ACCESS
      </span>
    </div>
  );
}
function BenefitsRow() {
  return (
    <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-2">
      <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-700">
        <svg className="h-4 w-4 shrink-0 text-zinc-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
        <span className="leading-tight">New Drops First</span>
      </div>

      <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-700">
        <svg className="h-4 w-4 shrink-0 text-zinc-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span className="leading-tight">Feature Releases</span>
      </div>

      <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-700">
        <svg className="h-4 w-4 shrink-0 text-zinc-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>
        <span className="leading-tight">Inbox & SMS Updates</span>
      </div>

      <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-700">
        <svg className="h-4 w-4 shrink-0 text-zinc-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span className="leading-tight">No Spam, Ever</span>
      </div>
    </div>
  );
}

function DarkFooterBanner() {
  return (
    <footer className="mt-20 border-t border-zinc-900 bg-[#0c0c10] py-12 text-white">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-[#a3e635]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <div>
              <h4 className="text-xs font-bold tracking-widest uppercase text-zinc-200">
                LIMITED DROPS
              </h4>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Exclusive packaging drops available to subscribers first.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-[#a3e635]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <div>
              <h4 className="text-xs font-bold tracking-widest uppercase text-zinc-200">
                PRODUCT UPDATES
              </h4>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Be the first to know about new features and tools.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-[#a3e635]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <div>
              <h4 className="text-xs font-bold tracking-widest uppercase text-zinc-200">
                DIRECT TO YOU
              </h4>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Delivered to your inbox or straight to your phone.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-[#a3e635]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <h4 className="text-xs font-bold tracking-widest uppercase text-zinc-200">
                NO SPAM, EVER
              </h4>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Only important updates. Unsubscribe anytime.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function Confirmation({
  confirmation,
  onReset,
}: {
  confirmation: Confirmation;
  onReset: () => void;
}) {
  const { alreadySubscribed, email, phone, emailStatus, smsStatus } =
    confirmation;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-6 rounded-[12px] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.22em] text-lime-600">
        <span className="h-1.5 w-1.5 bg-lime-400" />
        <span>{alreadySubscribed ? "ALREADY ON THE LIST" : "CONFIRMED"}</span>
      </div>

      <h2 className="mt-4 text-[26px] font-medium leading-[1.05] tracking-[-0.04em] sm:text-[32px]">
        {alreadySubscribed
          ? "YOU\u2019RE ALREADY ON THE LIST."
          : "YOU\u2019RE ON THE LIST."}
      </h2>

      <div className="mt-4 space-y-2 text-[13px] leading-6 text-zinc-600">
        {email && (
          <p>
            Email updates will go to{" "}
            <span className="font-mono text-[12px] font-medium text-zinc-900">
              {email}
            </span>
            .
          </p>
        )}

        {phone && (
          <p>
            SMS updates will go to{" "}
            <span className="font-mono text-[12px] font-medium text-zinc-900">
              {phone}
            </span>
            .
          </p>
        )}

        <p>
          {alreadySubscribed
            ? "You are set — nothing else to do."
            : "We will be in touch as soon as there is something worth sending."}
        </p>

        {(emailStatus === "failed" || smsStatus === "failed") && (
          <p className="rounded-[8px] border border-amber-200 bg-amber-50 p-3 text-[11px] leading-4 text-amber-800">
            Your sign-up is saved. Our confirmation message did not go out just
            now and has been logged, so there is no need to sign up again.
          </p>
        )}

        {phone && (
          <p className="font-mono text-[10px] leading-4 text-zinc-400">
            Reply STOP to any text to unsubscribe.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onReset}
        className="mt-7 inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-5 py-2.5 font-mono text-[10px] tracking-[0.16em] text-zinc-900 transition-colors hover:border-black hover:bg-black hover:text-white"
      >
        <span>SIGN UP ANOTHER PERSON</span>
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
