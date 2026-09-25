"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowIcon } from "./Icons";
import { START_PROJECT_HREF } from "../../lib/contact";

import {
  SMS_CONSENT_COPY,
  validateSignup,
  type SignupErrors,
} from "../../lib/subscribers";
import {
  buildFullPhone,
  DEFAULT_COUNTRY,
  type Country,
} from "../../lib/countries";
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


  if (confirmation) {
    return <Confirmation confirmation={confirmation} onReset={reset} />;
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <p className="text-[14px] font-medium text-zinc-600">
        Add an email address, a mobile number, or both.
      </p>

      <TextField
        id="subscriber-name"
        label="Name"
        type="text"
        autoComplete="name"
        value={form.name}
        placeholder="Alex"
        error={errors.name}
        onChange={(value) => update("name", value)}
      />

      <TextField
        id="subscriber-email"
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={form.email}
        placeholder="you@brand.com"
        error={errors.email}
        onChange={(value) => update("email", value)}
      />

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

      <p
        id="subscriber-sms-consent"
        className="text-[12px] leading-relaxed text-zinc-600"
      >
        {SMS_CONSENT_COPY}
      </p>

      {(errors.form || formError) && (
        <p
          role="alert"
          className="rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700"
        >
          {errors.form ?? formError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="group flex h-14 w-full items-center justify-between rounded-full bg-[#0a0a0a] pl-7 pr-6 text-[16px] font-extrabold text-white transition active:scale-[0.99] hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{submitting ? "Signing up…" : "Get early access"}</span>
        <ArrowIcon className="h-5 w-5 text-[var(--dcl-lime)] transition-transform group-hover:translate-x-1" />
      </button>

      <p className="text-center text-[12px] leading-relaxed text-zinc-500">
        We only send the updates you ask for. Unsubscribe any time — reply STOP
        to any text, or reply to any email.
      </p>
    </form>
  );
}

function TextField({
  id,
  label,
  value,
  error,
  onChange,
  ...input
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
} & Pick<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "autoComplete" | "placeholder"
>) {
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-bold text-zinc-900">
        {label} <span className="font-medium text-zinc-500">(optional)</span>
      </label>
      <input
        id={id}
        name={id.replace("subscriber-", "")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
        className={`mt-1.5 h-12 w-full rounded-2xl border-2 bg-white px-4 text-[15px] text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-black focus:ring-4 focus:ring-[var(--dcl-lime)]/50 ${
          error ? "border-red-400" : "border-zinc-300 hover:border-zinc-400"
        }`}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-[12px] font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
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
      className="rounded-[28px] border-2 border-black bg-white p-6"
    >
      <span className="inline-block rounded-full bg-[var(--dcl-lime)] px-3 py-1 text-[12px] font-extrabold">
        {alreadySubscribed ? "Already on the list" : "Confirmed"}
      </span>

      <h3 className="mt-4 text-[28px] font-black leading-[1.05] tracking-[-0.03em]">
        {alreadySubscribed
          ? "You’re already on the list."
          : "You’re on the list!"}
      </h3>

      <div className="mt-4 space-y-2 text-[14px] leading-6 text-zinc-700">
        {email && (
          <p>
            Email updates will go to{" "}
            <span className="font-bold text-zinc-950">{email}</span>.
          </p>
        )}

        {phone && (
          <p>
            SMS updates will go to{" "}
            <span className="font-bold text-zinc-950">{phone}</span>.
          </p>
        )}

        <p>
          {alreadySubscribed
            ? "You are set — nothing else to do."
            : "We will be in touch as soon as there is something worth sending."}
        </p>

        {(emailStatus === "failed" || smsStatus === "failed") && (
          <p className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900">
            Your sign-up is saved. Our confirmation message did not go out just
            now and has been logged, so there is no need to sign up again.
          </p>
        )}

        {phone && (
          <p className="text-[12px] text-zinc-500">
            Reply STOP to any text to unsubscribe.
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onReset}
          className="rounded-full border-2 border-black bg-white px-5 py-2.5 text-[14px] font-extrabold transition hover:bg-black hover:text-white"
        >
          Sign up another person
        </button>
        <Link
          href={START_PROJECT_HREF}
          className="rounded-full bg-black px-5 py-2.5 text-[14px] font-extrabold text-white transition hover:bg-zinc-800"
        >
          Start your project →
        </Link>
      </div>
    </div>
  );
}
