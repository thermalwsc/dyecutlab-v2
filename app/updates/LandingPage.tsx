"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import SignupForm from "./SignupForm";
import { Footer, Header, SmsLegalLinks, TrustRow } from "./SiteChrome";
import {
  ArrowIcon,
  BagLockIcon,
  Burst,
  ChatDotsIcon,
  PhoneChatIllustration,
  PhoneSmsIllustration,
  Sparkle,
} from "./Icons";
import {
  SMS_KEYWORD_CONSENT_COPY,
  SMS_KEYWORDS,
  SMS_KEYWORDS_LIVE,
  SMS_NUMBER,
  SMS_NUMBER_ACCEPTS_TEXTS,
  smsHref,
} from "../../lib/smsKeywords";
import { START_PROJECT_HREF } from "../../lib/contact";

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-[#0a0a0a] antialiased">
      <Header />
      <Hero />

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-4 sm:px-6 lg:grid-cols-2 lg:items-start lg:gap-8 lg:px-10">
        <OrderPanel />
        <BetaPanel />
      </div>

      <TrustRow />
      <Footer />
    </main>
  );
}

/* ---------------------------------------------------------------- */

/* ---------------------------------------------------------------- */

const CATEGORIES = [
  { label: "Boxes", src: "/boxes.png" },
  { label: "Mylar Bags", src: "/mylar-bags.png" },
  { label: "Novelties", src: "/novelties.png" },
  { label: "And More", src: "/and-more-stack.png" },
];

/* Mobile-first, matching the reference mockup: headline, subline and the
   category row share a narrow left column; the box stack fills the right
   side and bleeds off the edge. Sizes scale with vw so the layout keeps
   the same proportions from phone up to desktop. */
function Hero() {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-4 pb-8 pt-6 sm:px-6 sm:pb-12 sm:pt-10 lg:px-10 lg:pb-16 lg:pt-14">
      {/* Stacked product visual */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[10%] top-0 w-[48%] max-w-[360px] sm:right-0 sm:w-[40%] lg:right-12 lg:w-[30%]"
      >
        {/* Lime diagonal band behind the stack */}
        <div className="absolute inset-y-[4%] -right-6 left-[18%] bg-[var(--dcl-lime)] [clip-path:polygon(45%_0,100%_0,100%_100%,0_100%)]" />
        <Image
          src="/Hero-section-image.png"
          alt=""
          width={408}
          height={612}
          fetchPriority="high"
          sizes="(min-width: 1024px) 360px, 48vw"
          className="dcl-float relative h-auto w-full drop-shadow-[0_18px_24px_rgba(0,0,0,0.18)]"
        />
      </div>

      <div className="relative z-10">
        <h1 className="dcl-rise text-[clamp(28px,7.8vw,60px)] font-black leading-[1.02] tracking-[-0.045em] lg:text-[min(6.4vw,84px)]">
          Custom
          <br />
          Packaging
          <br />
          <span className="whitespace-nowrap">
            Made{" "}
            <span className="relative inline-block">
              <span className="relative z-10 inline-block -rotate-2 rounded-[0.35em] bg-[var(--dcl-lime)] px-[0.16em] pb-[0.05em]">
                Simple.
              </span>
              <Burst className="absolute -right-[0.5em] -top-[0.45em] h-[0.55em] w-[0.55em] text-[var(--dcl-lime-deep)]" />
            </span>
          </span>
        </h1>

        <p className="mt-3 max-w-[60%] text-[clamp(13px,3.6vw,22px)] font-semibold leading-snug text-zinc-900 sm:mt-5 lg:max-w-[26ch]">
          Boxes, mylar bags, novelties and more for your brand.
        </p>

        <ul className="mt-5 grid w-[62%] grid-cols-4 gap-[2%] sm:mt-8 sm:w-[56%] lg:w-[50%] lg:max-w-[560px]">
          {CATEGORIES.map(({ label, src }, index) => (
            <li key={label} className="relative flex flex-col items-center text-center">
              {/* Lime motion-line doodles, as in the reference */}
              {index === 0 && (
                <Burst className="absolute -left-[14%] top-[6%] h-[30%] w-[30%] -scale-x-100 text-[var(--dcl-lime-deep)]" />
              )}
              <Burst className="absolute -right-[16%] top-[4%] h-[30%] w-[30%] text-[var(--dcl-lime-deep)]" />
              <Image
                src={src}
                alt=""
                width={512}
                height={512}
                sizes="(min-width: 1024px) 96px, 15vw"
                className="aspect-square w-[82%] object-contain"
              />
              <span className="mt-1.5 text-balance text-[clamp(10px,2.9vw,17px)] font-extrabold leading-tight">
                {label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */

/* Full-width pill that tells the visitor which keyword to text.
   Tappable (`sms:` link) whenever the number is real and staffed. */
function SmsPill({ keyword }: { keyword: string }) {
  const content = (
    <>
      <ChatDotsIcon className="h-9 w-9 shrink-0 text-black sm:h-12 sm:w-12" />
      <span className="min-w-0 flex-1 text-[clamp(13px,3.85vw,24px)] font-extrabold lg:text-[20px] leading-tight tracking-[-0.025em]">
        Text {keyword} to{" "}
        <span className="whitespace-nowrap">{SMS_NUMBER.display}</span>
      </span>
      <ArrowIcon className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1 sm:h-6 sm:w-6" />
    </>
  );

  const className =
    "group flex w-full items-center gap-2 rounded-full border-[3px] border-black bg-[var(--dcl-lime)] py-2 pl-2 pr-3.5 text-black sm:gap-4 sm:py-3 sm:pl-2.5 sm:pr-5";

  if (SMS_NUMBER_ACCEPTS_TEXTS) {
    return (
      <a href={smsHref(keyword)} className={`${className} transition active:scale-[0.99]`}>
        {content}
      </a>
    );
  }

  return <div className={className}>{content}</div>;
}

function BetaPanel() {
  /* Until JOIN is handled automatically, the web form is the reliable
     way to join, so it stays open. Once automated it becomes the
     "prefer a form?" fallback. */
  const [showForm, setShowForm] = useState(!SMS_KEYWORDS_LIVE);

  return (
    <section
      id="beta"
      aria-labelledby="beta-heading"
      className="scroll-mt-6 rounded-[28px] bg-[var(--dcl-lime-soft)] p-4 sm:rounded-[32px] sm:p-8"
    >
      <div className="flex items-center gap-2.5 sm:gap-5">
        <PhoneChatIllustration className="h-[clamp(64px,19vw,112px)] w-[clamp(64px,19vw,112px)] lg:h-[100px] lg:w-[100px] shrink-0 text-black" />
        <div className="min-w-0">
          <h2
            id="beta-heading"
            className="relative inline-block whitespace-nowrap text-[clamp(22px,6.4vw,48px)] lg:text-[34px] font-black leading-none tracking-[-0.045em]"
          >
            Join Our Beta!
            <Sparkle className="absolute -right-2 -top-3 h-4 w-4 text-[var(--dcl-lime-deep)]" />
          </h2>
          <p className="mt-2 text-[clamp(12px,3.5vw,18px)] font-semibold lg:text-[16px] leading-snug text-zinc-900">
            Be the first to try our new tools. Get updates by text.
          </p>
        </div>
      </div>

      <div className="mt-4 sm:mt-6">
        <SmsPill keyword={SMS_KEYWORDS.join} />
      </div>

      <p className="mx-auto mt-2.5 max-w-[52ch] text-center text-[clamp(10px,2.8vw,12px)] leading-relaxed text-zinc-700">
        {SMS_KEYWORD_CONSENT_COPY}
        <SmsLegalLinks />
      </p>

      {!SMS_KEYWORDS_LIVE && (
        <p className="mt-2 text-center text-[12px] font-bold text-zinc-900">
          Rather not text? Sign up with the form below.
        </p>
      )}

      <div className="mt-6 border-t-2 border-dashed border-black/15 pt-5">
        {SMS_KEYWORDS_LIVE && (
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            aria-expanded={showForm}
            aria-controls="beta-form"
            className="mx-auto flex items-center gap-2 text-[14px] font-extrabold underline decoration-2 underline-offset-4"
          >
            {showForm ? "Hide the form" : "Prefer email? Sign up with a form"}
          </button>
        )}

        {showForm && (
          <div id="beta-form" className={SMS_KEYWORDS_LIVE ? "mt-5" : undefined}>
            <SignupForm />
          </div>
        )}
      </div>
    </section>
  );
}

function OrderPanel() {
  return (
    <section
      id="order"
      aria-labelledby="order-heading"
      className="relative scroll-mt-6 overflow-hidden rounded-[28px] bg-[#0a0a0a] p-4 text-white sm:rounded-[32px] sm:p-8"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2
            id="order-heading"
            className="text-[clamp(22px,6.4vw,48px)] lg:text-[34px] font-black leading-[1.02] tracking-[-0.045em]"
          >
            <span className="flex items-center gap-2">
              <BagLockIcon className="h-[1.1em] w-[1.1em] shrink-0" />
              <span className="whitespace-nowrap">Need Packaging</span>
            </span>
            <span className="relative ml-[1.35em] inline-block text-[var(--dcl-lime)]">
              Now?
              <Burst className="absolute -right-[0.8em] top-[0.1em] h-[0.6em] w-[0.6em] -scale-x-100 rotate-90 text-[var(--dcl-lime)]" />
            </span>
          </h2>
          <p className="mt-2 max-w-[30ch] text-[clamp(12px,3.6vw,18px)] font-semibold lg:text-[16px] leading-snug text-white">
            Text us today and our team will help with your order.
          </p>
        </div>
        <PhoneSmsIllustration className="-mr-2 -mt-2 h-[clamp(72px,21vw,144px)] w-[clamp(72px,21vw,144px)] lg:h-[110px] lg:w-[110px] shrink-0" />
      </div>

      <div className="mt-3 sm:mt-6">
        <SmsPill keyword={SMS_KEYWORDS.order} />
      </div>

      {!SMS_KEYWORDS_LIVE && (
        <p className="mt-4 text-center text-[13px] font-semibold text-zinc-300">
          Rather type it out?{" "}
          <Link
            href={START_PROJECT_HREF}
            className="whitespace-nowrap font-extrabold text-[var(--dcl-lime)] underline decoration-2 underline-offset-4"
          >
            Start your project online →
          </Link>
        </p>
      )}
    </section>
  );
}
