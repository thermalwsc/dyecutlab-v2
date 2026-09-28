"use client";

import Link from "next/link";
import { useState } from "react";
import PhoneField from "../updates/PhoneField";
import { SmsLegalLinks } from "../updates/SiteChrome";
import {
  ArrowIcon,
  Burst,
  ChatDotsIcon,
  PhoneChatIllustration,
  Sparkle,
} from "../updates/Icons";
import { DEFAULT_COUNTRY, buildFullPhone, type Country } from "../../lib/countries";
import { CONTACT } from "../../lib/contact";
import {
  DESCRIPTION_MAX_LENGTH,
  QUOTE_SMS_CONSENT_COPY,
  validateQuoteRequest,
  type QuoteErrors,
} from "../../lib/quoteRequests";

type QuoteResponse = { ok?: boolean; error?: string; errors?: QuoteErrors };

/* "+14055550100" → "(405) 555-0100"; other countries stay E.164. */
function formatPhone(e164: string) {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return us ? `(${us[1]}) ${us[2]}-${us[3]}` : e164;
}

/* Prefilled customer text: kept around 300 chars so long `sms:` bodies
   don't fail on some devices. The full 1000-char request is already saved
   on the site, so a trimmed message notes that. */
const CUSTOMER_SMS_BODY_MAX = 300;

function buildCustomerSmsBody(description: string, phone: string) {
  const flat = description.replace(/\s+/g, " ").trim();
  const base = `New project: ${flat} | My number: ${phone}`;

  if (base.length <= CUSTOMER_SMS_BODY_MAX) return base;

  const suffix = " (full request saved on site)";
  const phonePart = ` | My number: ${phone}${suffix}`;
  const budget = CUSTOMER_SMS_BODY_MAX - "New project: ".length - phonePart.length - 1; // 1 for "…"
  const trimmed = flat.slice(0, Math.max(0, budget)).trimEnd();

  return `New project: ${trimmed}…${phonePart}`;
}

/* Same `sms:` form used by the JOIN / ORDER pills — works on iPhone + Android. */
function customerSmsHref(body: string) {
  return `sms:${CONTACT.phoneE164}?&body=${encodeURIComponent(body)}`;
}

type ConfirmationData = {
  phone: string;
  smsBody: string;
  smsHref: string;
  truncated: boolean;
};

export default function StartForm() {
  const [description, setDescription] = useState("");
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [localPhone, setLocalPhone] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [errors, setErrors] = useState<QuoteErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationData | null>(null);
  const sentTo = confirmation?.phone ?? null;

  const phone = buildFullPhone(country.dial, localPhone);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validateQuoteRequest({ description, phone });

    if (!validation.ok) {
      setErrors(validation.errors);
      setFormError(null);
      return;
    }

    setErrors({});
    setFormError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/quote-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description, phone, website }),
      });

      const payload = (await response
        .json()
        .catch(() => null)) as QuoteResponse | null;

      if (!response.ok) {
        if (payload?.errors) setErrors(payload.errors);
        setFormError(payload?.error ?? "Something went wrong. Please try again.");
        return;
      }

      const smsBody = buildCustomerSmsBody(
        validation.value.description,
        validation.value.phone
      );

      setConfirmation({
        phone: validation.value.phone,
        smsBody,
        smsHref: customerSmsHref(smsBody),
        truncated: validation.value.description.length > smsBody.length,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("QUOTE REQUEST ERROR:", error);
      setFormError(
        "We couldn't reach the server. Check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setDescription("");
    setLocalPhone("");
    setErrors({});
    setFormError(null);
    setConfirmation(null);
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-6 pt-6 sm:px-6 sm:pt-10 lg:px-10 lg:pt-14">
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-10">
        <div>
          <Headline done={Boolean(sentTo)} />

          <div className="mt-6 sm:mt-8">
            {confirmation ? (
              <Confirmation
                phone={confirmation.phone}
                smsBody={confirmation.smsBody}
                smsHref={confirmation.smsHref}
                onReset={reset}
              />
            ) : (
              <form
                onSubmit={submit}
                noValidate
                className="rounded-[28px] bg-[var(--dcl-lime-soft)] p-4 sm:rounded-[32px] sm:p-8"
              >
                <div className="space-y-5">
                  <div>
                    <div className="flex items-baseline justify-between gap-3">
                      <label htmlFor="quote-description" className="block text-[13px] font-bold text-zinc-900">
                        What do you want made?{" "}
                        <span aria-hidden="true" className="text-red-500">*</span>
                      </label>
                      <span
                        aria-hidden="true"
                        className={`text-[11px] tabular-nums ${
                          description.length > DESCRIPTION_MAX_LENGTH ? "text-red-500" : "text-zinc-400"
                        }`}
                      >
                        {description.length}/{DESCRIPTION_MAX_LENGTH}
                      </span>
                    </div>
                    <textarea
                      id="quote-description"
                      name="description"
                      rows={4}
                      required
                      aria-required="true"
                      value={description}
                      onChange={(event) => {
                        setDescription(event.target.value);
                        if (errors.description) setErrors((e) => ({ ...e, description: undefined }));
                      }}
                      placeholder="e.g. 500 black mailer boxes, 10 × 8 × 4 in, logo on the lid"
                      aria-invalid={Boolean(errors.description)}
                      aria-describedby={errors.description ? "quote-description-error" : undefined}
                      className={`mt-1.5 w-full resize-none rounded-2xl border-2 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-black focus:ring-4 focus:ring-[var(--dcl-lime)]/50 ${
                        errors.description ? "border-red-400" : "border-zinc-300 hover:border-zinc-400"
                      }`}
                    />
                    {errors.description && (
                      <p id="quote-description-error" role="alert" className="mt-1.5 text-[12px] font-medium text-red-600">
                        {errors.description}
                      </p>
                    )}
                  </div>

                  <PhoneField
                    id="quote-phone"
                    label="Your mobile number"
                    required
                    consentId="quote-sms-consent"
                    country={country}
                    localPhone={localPhone}
                    error={errors.phone}
                    onLocalChange={setLocalPhone}
                    onSelectCountry={setCountry}
                    onClearError={() =>
                      setErrors((current) =>
                        current.phone ? { ...current, phone: undefined } : current
                      )
                    }
                  />

                  {/* Honeypot — hidden from people and assistive tech. */}
                  <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                    <label htmlFor="quote-website">Website</label>
                    <input
                      id="quote-website"
                      name="website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(event) => setWebsite(event.target.value)}
                    />
                  </div>

                  <p id="quote-sms-consent" className="text-[12px] leading-relaxed text-zinc-600">
                    {QUOTE_SMS_CONSENT_COPY}
                    <SmsLegalLinks />
                  </p>

                  {formError && (
                    <p role="alert" className="rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="group flex h-14 w-full items-center justify-between rounded-full bg-[#0a0a0a] pl-7 pr-6 text-[16px] font-extrabold text-white transition hover:bg-zinc-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>{submitting ? "Saving…" : "Send it by text"}</span>
                    <ArrowIcon className="h-5 w-5 text-[var(--dcl-lime)] transition-transform group-hover:translate-x-1" />
                  </button>

                  <p className="flex items-center justify-center gap-2 text-center text-[13px] font-bold text-zinc-900">
                    <ChatDotsIcon className="h-5 w-5 shrink-0" />
                    We save it first, then your Messages app opens. Real humans, no bots.
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>

        <HowItWorks />
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */

function Headline({ done }: { done: boolean }) {
  return (
    <div>
      <p className="inline-flex items-center gap-2 rounded-full border-2 border-black bg-white px-3 py-1 text-[12px] font-extrabold">
        <span className="h-2 w-2 rounded-full bg-[var(--dcl-lime-deep)]" />
        {done ? "Request sent" : "Start your project"}
      </p>

      <h1 className="dcl-rise mt-4 text-[clamp(34px,9.4vw,76px)] font-black leading-[1.02] tracking-[-0.045em]">
        {done ? (
          <>
            We got{" "}
            <Highlight>it.</Highlight>
          </>
        ) : (
          <>
            Tell us what
            <br />
            you&rsquo;re{" "}
            <Highlight>making.</Highlight>
          </>
        )}
      </h1>

      <p className="mt-3 max-w-[34ch] text-[clamp(15px,4.2vw,21px)] font-semibold leading-snug text-zinc-900 sm:mt-4">
        {done
          ? "Your request is saved — now send it by text so our team can reply."
          : "Send it straight to our team by text — fast. A real human replies, no bots, no waiting on hold."}
      </p>
    </div>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      <span className="relative z-10 inline-block -rotate-2 rounded-[0.35em] bg-[var(--dcl-lime)] px-[0.16em] pb-[0.05em]">
        {children}
      </span>
      <Burst className="absolute -right-[0.5em] -top-[0.45em] h-[0.55em] w-[0.55em] text-[var(--dcl-lime-deep)]" />
    </span>
  );
}

const STEPS = [
  { title: "Tell us what you need", body: "A line or two is plenty — what it is, how many, rough size." },
  { title: "You text us", body: "Your Messages app opens with everything prefilled — just tap send." },
  { title: "Get your quote", body: "Our team replies straight to your phone with pricing, options and timing." },
];

function HowItWorks() {
  return (
    <aside
      aria-labelledby="how-heading"
      className="relative overflow-hidden rounded-[28px] bg-[#0a0a0a] p-5 text-white sm:rounded-[32px] sm:p-8 lg:mt-[clamp(0px,11vw,164px)]"
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id="how-heading"
          className="text-[clamp(24px,6.8vw,34px)] font-black leading-[1.02] tracking-[-0.045em]"
        >
          How it <span className="text-[var(--dcl-lime)]">works</span>
        </h2>
        <Sparkle className="mt-1 h-5 w-5 text-[var(--dcl-lime)]" />
      </div>

      <ol className="mt-5 space-y-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--dcl-lime)] text-[16px] font-black text-black">
              {index + 1}
            </span>
            <div>
              <p className="text-[16px] font-extrabold leading-tight">{step.title}</p>
              <p className="mt-0.5 text-[14px] leading-snug text-zinc-300">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-6 border-t border-white/15 pt-4 text-[13px] text-zinc-300">
        Rather email?{" "}
        <a
          href={`mailto:${CONTACT.email}`}
          className="font-extrabold text-[var(--dcl-lime)] underline decoration-2 underline-offset-4"
        >
          {CONTACT.email}
        </a>
      </p>
    </aside>
  );
}

function Confirmation({
  phone,
  smsBody,
  smsHref,
  onReset,
}: {
  phone: string;
  smsBody: string;
  smsHref: string;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(smsBody);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard API unavailable (older browsers) — the message text
         below stays selectable so it can be copied by hand. */
      setCopied(false);
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[28px] bg-[var(--dcl-lime-soft)] p-5 sm:rounded-[32px] sm:p-8"
    >
      <div className="flex items-center gap-4">
        <PhoneChatIllustration className="h-20 w-20 shrink-0 text-black sm:h-24 sm:w-24" />
        <div className="min-w-0">
          <p className="text-[clamp(20px,5.6vw,28px)] font-black leading-tight tracking-[-0.03em]">
            Your request is saved.
          </p>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-zinc-800">
            Now send it by text from{" "}
            <span className="whitespace-nowrap font-extrabold text-black">{formatPhone(phone)}</span>{" "}
            to{" "}
            <span className="whitespace-nowrap font-extrabold text-black">{CONTACT.phoneDisplay}</span>{" "}
            so our team can reply.
          </p>
        </div>
      </div>

      {/* iPhone-safe path: a real anchor the customer taps. Browsers can
          block scripted navigation to `sms:` after an async save, so no
          automatic open is attempted — this button is the main path. */}
      <a
        href={smsHref}
        className="group mt-5 flex h-14 w-full items-center justify-between rounded-full bg-[#0a0a0a] pl-7 pr-6 text-[16px] font-extrabold text-white transition hover:bg-zinc-800 active:scale-[0.99]"
      >
        <span>Open Messages to send it</span>
        <ArrowIcon className="h-5 w-5 text-[var(--dcl-lime)] transition-transform group-hover:translate-x-1" />
      </a>

      {/* Desktop fallback: `sms:` links do nothing on most desktops, so the
          number + message stay visible and copyable for sending from a phone. */}
      <div className="mt-4 rounded-2xl border-2 border-black bg-white px-4 py-3">
        <p className="text-[14px] font-semibold leading-snug">
          Texting from a computer? Send this from your phone to{" "}
          <a
            href={`tel:${CONTACT.phoneE164}`}
            className="whitespace-nowrap font-extrabold underline decoration-[var(--dcl-lime-deep)] decoration-2 underline-offset-4"
          >
            {CONTACT.phoneDisplay}
          </a>
        </p>
        <p className="mt-2 rounded-xl bg-[var(--dcl-lime-soft)] px-3 py-2 text-[13px] leading-relaxed text-zinc-800">
          {smsBody}
        </p>
        <button
          type="button"
          onClick={copyMessage}
          className="mt-3 h-11 rounded-full border-[3px] border-black bg-white px-6 text-[14px] font-extrabold transition hover:bg-black hover:text-white"
        >
          {copied ? "Copied!" : "Copy message"}
        </button>
      </div>

      <p className="mt-4 text-[12px] leading-relaxed text-zinc-600">
        {QUOTE_SMS_CONSENT_COPY}
        <SmsLegalLinks />
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="group flex h-14 items-center justify-between rounded-full border-[3px] sm:flex-1 border-black bg-[var(--dcl-lime)] pl-6 pr-5 text-[16px] font-extrabold text-black"
        >
          Back to home
          <ArrowIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </Link>
        <button
          type="button"
          onClick={onReset}
          className="h-14 rounded-full border-[3px] border-black bg-white sm:flex-1 px-6 text-[16px] font-extrabold transition hover:bg-black hover:text-white"
        >
          Send another request
        </button>
      </div>
    </div>
  );
}
