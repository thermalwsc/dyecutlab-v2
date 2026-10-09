"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import Parallax from "./Parallax";
import SignupForm from "./SignupForm";
import { Header, SmsLegalLinks, Wordmark } from "./SiteChrome";
import {
  ArrowIcon,
  BagLockIcon,
  ChatDotsIcon,
  CubeLogo,
  GlobeIcon,
  InstagramIcon,
  LaptopIcon,
  PhoneChatIllustration,
  PhoneSmsIllustration,
  PlusIcon,
  Sparkle,
  TikTokIcon,
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
import { SHOW_BETA_SIGNUP } from "../../lib/siteFlags";

/* Mobile-first landing page (most visitors are on iPhone). Section order
   follows the client's mockup: hero → how it works → text/online/beta
   panels → real projects → why us → anywhere → FAQ → question → footer.
   Desktop reuses the same blocks in wider grids. */
export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-[#0a0a0a] antialiased">
      <Header />
      <Hero />
      <HowItWorks />

      <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 pt-8 sm:px-6 lg:grid-cols-2 lg:items-start lg:gap-8 lg:px-10 lg:pt-16">
        {SHOW_BETA_SIGNUP ? (
          <>
            <div className="grid gap-5">
              <OrderPanel />
              <StartOnlinePanel />
            </div>
            <BetaPanel />
          </>
        ) : (
          /* Beta panel hidden (see lib/siteFlags.ts): the two ways to start sit side by side. */
          <>
            <OrderPanel />
            <StartOnlinePanel />
          </>
        )}
      </div>

      <RealProjects />
      <WhyUs />

      <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 pb-8 sm:px-6 lg:grid-cols-2 lg:items-start lg:gap-8 lg:px-10">
        <Anywhere />
        <div className="grid gap-5">
          <Faq />
          <QuestionPanel />
        </div>
      </div>

      <LandingFooter />
    </main>
  );
}

/* ---------------------------------------------------------------- */
/* Shared bits                                                      */
/* ---------------------------------------------------------------- */

function Eyebrow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <p
      className={`flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] ${
        dark ? "text-[var(--dcl-lime)]" : "text-[var(--dcl-lime-deep)]"
      }`}
    >
      {children}
      <span aria-hidden="true" className="h-[2px] w-10 bg-current" />
    </p>
  );
}

const H2 = "text-[clamp(30px,8.6vw,52px)] font-black leading-[1.02] tracking-[-0.045em]";

/* Lime pill that opens the visitor's messages app (sms: link). Two-line
   label on phones so the number is always fully visible. */
function SmsButton({ keyword, title }: { keyword?: string; title: string }) {
  const content = (
    <>
      <ChatDotsIcon className="h-10 w-10 shrink-0 text-black" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[17px] font-extrabold tracking-[-0.02em]">{title}</span>
        <span className="block whitespace-nowrap text-[17px] font-extrabold tracking-[-0.02em]">{SMS_NUMBER.display}</span>
      </span>
      <ArrowIcon className="h-6 w-6 shrink-0 transition-transform group-hover:translate-x-1" />
    </>
  );
  const className =
    "group flex min-h-[64px] w-full items-center gap-3 rounded-full border-[3px] border-black bg-[var(--dcl-lime)] py-2.5 pl-2.5 pr-5 text-black";

  return SMS_NUMBER_ACCEPTS_TEXTS ? (
    <a href={smsHref(keyword)} className={`${className} transition active:scale-[0.98]`}>
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}

/* ---------------------------------------------------------------- */
/* 1 · Hero                                                         */
/* ---------------------------------------------------------------- */

const CATEGORIES = [
  { label: "Boxes", src: "/boxes.png" },
  { label: "Mylar Bags", src: "/mylar-bags.png" },
  { label: "Novelties", src: "/novelties.png" },
];

function Hero() {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-8 pt-7 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-10 lg:px-10 lg:pb-16 lg:pt-14">
      <div className="dcl-rise">
        <h1 className="text-[clamp(42px,12.4vw,76px)] font-black leading-[0.98] tracking-[-0.05em]">
          Send
          <br />
          Your Idea.
          <br />
          We&rsquo;ll Help
          <br />
          <span className="mt-1 inline-block -rotate-2 rounded-[0.3em] bg-[var(--dcl-lime)] px-[0.14em] pb-[0.04em]">
            Make It.
          </span>
        </h1>
        <p className="mt-4 max-w-[30ch] text-[17px] font-medium leading-snug text-zinc-800 lg:text-[19px]">
          Custom packaging for your brand. Boxes, mylar bags, novelties and more.
        </p>

        <div className="mt-6 hidden max-w-[420px] lg:block">
          <HeroActions />
        </div>
      </div>

      <div>
        <HeroVisual />
        <div className="mt-5 lg:hidden">
          <HeroActions />
        </div>
        <CategoryTiles />
      </div>
    </section>
  );
}

function HeroActions() {
  return (
    <>
      <SmsButton title="Text Us Your Idea" />
      <p className="mt-3 text-center lg:text-left">
        <Link
          href={START_PROJECT_HREF}
          className="inline-flex items-center gap-1 py-1 text-[15px] font-extrabold underline decoration-2 underline-offset-4"
        >
          Or start your project online <span aria-hidden="true">→</span>
        </Link>
      </p>
    </>
  );
}

/* One composed product shot (box, watch-shaped mylar bag, plush) on white,
   so it blends into the page. It drifts slightly as you scroll. */
function HeroVisual() {
  return (
    <Parallax speed={0.08} max={50} className="mx-auto w-full max-w-[520px]" innerClassName="dcl-float">
      <Image
        src="/hero-products.png"
        alt="Holographic custom box, watch-shaped mylar bag and plush bunny with the DYE CUT LAB cube logo"
        width={1254}
        height={1254}
        priority
        sizes="(min-width: 1024px) 520px, 92vw"
        className="h-auto w-full"
      />
    </Parallax>
  );
}
function CategoryTiles() {
  return (
    <ul className="mt-6 grid grid-cols-3 gap-y-2.5">
      {CATEGORIES.map(({ label, src }, index) => (
        <li
          key={label}
          className={`flex flex-col items-center px-2 pb-3 pt-2 text-center ${index > 0 ? "border-l-2 border-zinc-200" : ""}`}
        >
          <Image src={src} alt="" width={256} height={256} sizes="28vw" className="aspect-square w-[86%] object-contain" />
          <span className="mt-1 text-[14px] font-extrabold leading-tight">{label}</span>
        </li>
      ))}
      <li className="col-span-3">
        <Link
          href={START_PROJECT_HREF}
          className="flex flex-col items-center justify-center gap-1.5 rounded-[28px] bg-zinc-100 py-4 text-[15px] font-extrabold transition active:scale-[0.99]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-[var(--dcl-lime)]">
            <PlusIcon className="h-5 w-5" />
          </span>
          And More
        </Link>
      </li>
    </ul>
  );
}

/* ---------------------------------------------------------------- */
/* 2 · How it works                                                 */
/* ---------------------------------------------------------------- */

/* Icon artwork lives in /public: icon-*.png (black outline, for light
   backgrounds) and icon-*-white.png (white outline, for dark backgrounds). */
const STEPS = [
  { title: "Send Your Idea", body: "Text us a photo, sketch or just describe it.", icon: "/icon-phone.png" },
  { title: "We Figure It Out", body: "Our team helps with materials, size, and production.", icon: "/icon-puzzle.png" },
  { title: "See Your Proof", body: "Review and approve your design.", icon: "/icon-eye.png" },
  { title: "We Make It", body: "We handle production and delivery.", icon: "/icon-cube.png" },
];

function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-heading" className="relative scroll-mt-6 overflow-hidden bg-white text-[#0a0a0a]">
      <Parallax speed={0.22} max={150} className="pointer-events-none absolute -right-12 top-6 h-60 w-60 sm:h-80 sm:w-80" innerClassName="h-full w-full">
        <CubeLogo className="h-full w-full text-black opacity-[0.04]" />
      </Parallax>
      <Parallax speed={-0.1} max={90} className="pointer-events-none absolute -left-14 bottom-4 h-44 w-44 sm:h-60 sm:w-60" innerClassName="h-full w-full">
        <CubeLogo className="h-full w-full text-[var(--dcl-lime-deep)] opacity-[0.12]" />
      </Parallax>
      <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:gap-16 lg:px-10 lg:py-20">
        <div>
          <Eyebrow>It&rsquo;s easy</Eyebrow>
          <h2 id="how-heading" className={`mt-3 ${H2}`}>
            From Idea
            <br />
            to Delivered.
          </h2>
          <p className="mt-3 text-[16px] font-medium text-zinc-700">No packaging knowledge needed.</p>
        </div>

        <ol className="relative grid gap-7">
          <span aria-hidden="true" className="absolute bottom-6 left-[83px] top-6 border-l-2 border-dashed border-black/20" />
          {STEPS.map(({ title, body, icon }, index) => (
            <li key={title} className="relative grid grid-cols-[56px_auto_1fr] items-start gap-3">
              <Image src={icon} alt="" width={112} height={112} className="h-14 w-14 object-contain" />
              <span className="relative z-10 mt-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-black bg-[var(--dcl-lime)] text-[13px] font-black text-black">
                {index + 1}
              </span>
              <span className="mt-1">
                <span className="block text-[17px] font-extrabold leading-tight">{title}</span>
                <span className="mt-0.5 block text-[14px] leading-snug text-zinc-600">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* 3 · Text / start online / beta                                  */
/* ---------------------------------------------------------------- */

function OrderPanel() {
  return (
    <section
      id="order"
      aria-labelledby="order-heading"
      className="relative scroll-mt-6 overflow-hidden rounded-[28px] bg-[#0a0a0a] p-6 text-white sm:p-8"
    >
      <PhoneSmsIllustration className="absolute -right-1 -top-3 h-[200px] w-[200px] sm:right-0 sm:h-[230px] sm:w-[230px]" />
      <BagLockIcon className="relative h-11 w-11" />
      <h2 id="order-heading" className="relative z-10 mt-3 text-[clamp(38px,11.6vw,54px)] font-black leading-[0.98] tracking-[-0.045em] [text-shadow:-3px_0_#0a0a0a,3px_0_#0a0a0a,0_-3px_#0a0a0a,0_3px_#0a0a0a,-2px_-2px_#0a0a0a,2px_-2px_#0a0a0a,-2px_2px_#0a0a0a,2px_2px_#0a0a0a]">
        Need
        <br />
        Packaging
        <br />
        <span className="text-[var(--dcl-lime)]">Now?</span>
      </h2>
      <p className="relative mt-3 max-w-[24ch] text-[16px] font-semibold leading-snug">
        Text us and our team will help with your order.
      </p>
      <div className="relative mt-5">
        <SmsButton keyword={SMS_KEYWORDS.order} title={`Text ${SMS_KEYWORDS.order} to`} />
      </div>
    </section>
  );
}

function StartOnlinePanel() {
  return (
    <section aria-labelledby="online-heading">
      <p className="mb-3 text-[16px] font-extrabold">Prefer to start online?</p>
      <div className="rounded-[28px] bg-zinc-100 p-5 sm:p-8">
        <LaptopIcon className="h-12 w-12" />
        <h2 id="online-heading" className="mt-2 text-[28px] font-black leading-[1.02] tracking-[-0.04em]">
          Start Your
          <br />
          Project Online
        </h2>
        <p className="mt-2 max-w-[30ch] text-[15px] font-medium leading-snug text-zinc-700">
          Upload your idea, add details, and our team will reach out.
        </p>
        <Link
          href={START_PROJECT_HREF}
          className="mt-5 flex min-h-[56px] w-full items-center justify-between rounded-full bg-black px-6 text-[16px] font-extrabold text-white transition active:scale-[0.98]"
        >
          Start Now
          <ArrowIcon className="h-5 w-5" />
        </Link>
      </div>
    </section>
  );
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
      className="scroll-mt-6 rounded-[28px] bg-[var(--dcl-lime-soft)] p-5 sm:p-8"
    >
      <div className="flex items-center gap-3">
        <PhoneChatIllustration className="h-[84px] w-[84px] shrink-0 text-black" />
        <div className="min-w-0">
          <h2 id="beta-heading" className="relative inline-block text-[28px] font-black leading-none tracking-[-0.045em]">
            Join Our Beta!
            <Sparkle className="absolute -right-4 -top-3 h-4 w-4 text-[var(--dcl-lime-deep)]" />
          </h2>
          <p className="mt-1.5 text-[15px] font-semibold leading-snug">Packaging is about to get easier.</p>
        </div>
      </div>
      <p className="mt-3 text-center text-[15px] font-medium leading-snug text-zinc-800">
        Get early access to faster quotes, project updates and easier ordering.
      </p>

      <div className="mt-4">
        <SmsButton keyword={SMS_KEYWORDS.join} title={`Text ${SMS_KEYWORDS.join} to`} />
      </div>

      <div className="mt-6">
        <p className="flex items-center gap-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">
          <span aria-hidden="true" className="h-px flex-1 border-t-2 border-dashed border-black/15" />
          Or sign up below
          <span aria-hidden="true" className="h-px flex-1 border-t-2 border-dashed border-black/15" />
        </p>

        {SMS_KEYWORDS_LIVE && (
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            aria-expanded={showForm}
            aria-controls="beta-form"
            className="mx-auto mt-4 flex items-center gap-2 text-[14px] font-extrabold underline decoration-2 underline-offset-4"
          >
            {showForm ? "Hide the form" : "Prefer email? Sign up with a form"}
          </button>
        )}

        {showForm && (
          <div id="beta-form" className="mt-4">
            <p className="mb-3 text-[16px] font-extrabold">Get beta updates by email.</p>
            <SignupForm />
          </div>
        )}
      </div>

      <p className="mx-auto mt-5 max-w-[52ch] text-center text-[11px] leading-relaxed text-zinc-700">
        {SMS_KEYWORD_CONSENT_COPY}
        <SmsLegalLinks />
      </p>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* 4 · Real projects + why us                                       */
/* ---------------------------------------------------------------- */

/* src: null shows a dashed "photo coming soon" tile. cover: true is for
   full studio photos (own background) that fill the tile edge to edge;
   cut-out PNGs sit centred on the grey tile instead. */
const PROJECTS: { src: string | null; alt: string; w: number; h: number; cover?: boolean }[] = [
  { src: "/boxes.png", alt: "Holographic custom mailer box", w: 448, h: 448 },
  { src: "/mylar-bags.png", alt: "Holographic die-cut mylar bag", w: 320, h: 400 },
  { src: "/novelties.png", alt: "Custom plush novelty", w: 448, h: 420 },
  { src: "/dcl-box.png", alt: "Black mailer box with lime DCL graffiti print", w: 1254, h: 1254, cover: true },
  { src: "/dcl-bag.png", alt: "Holographic stand-up mylar bag with lime DCL print", w: 1254, h: 1254, cover: true },
  { src: "/sticker-rolls.png", alt: "Rolls of white and lime DCL cube-logo stickers", w: 1254, h: 1254, cover: true },
];

function RealProjects() {
  return (
    <section aria-labelledby="projects-heading" className="mx-auto w-full max-w-6xl px-4 pt-12 sm:px-6 lg:px-10 lg:pt-20">
      <Eyebrow>Real examples</Eyebrow>
      <h2 id="projects-heading" className={`mt-3 ${H2}`}>
        Made for
        <br />
        Real Brands.
      </h2>
      <p className="mt-3 max-w-[34ch] text-[16px] font-medium leading-snug text-zinc-700">
        From custom boxes to die cut bags and novelties. If you can imagine it, we can help make it.
      </p>
      <ul className="mt-6 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
        {PROJECTS.map(({ src, alt, w, h, cover }) =>
          src === null ? (
            <li
              key={alt}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-zinc-300 bg-zinc-50 p-4 text-center lg:aspect-[4/3.4]"
            >
              <CubeLogo className="h-10 w-10 text-zinc-300" />
              <span className="text-[15px] font-extrabold text-zinc-500">{alt}</span>
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Photo coming soon</span>
            </li>
          ) : (
          <li
            key={src}
            className={`relative aspect-square overflow-hidden rounded-[22px] bg-zinc-100 lg:aspect-[4/3.4] ${cover ? "" : "flex items-center justify-center p-4 sm:p-6"}`}
          >
            {/* The photo is taller than its frame and slides inside it, so
                the edges never show (cap < the 10% overscan). */}
            <Parallax
              speed={cover ? 0.09 : 0.06}
              max={cover ? 12 : 8}
              className={cover ? "absolute -inset-y-[10%] inset-x-0" : "h-full w-full"}
              innerClassName="h-full w-full"
            >
              <Image
                src={src}
                alt={alt}
                width={w}
                height={h}
                sizes="(min-width: 1024px) 340px, 46vw"
                className={
                  cover
                    ? "h-full w-full object-cover"
                    : "mx-auto h-full w-auto max-w-full object-contain drop-shadow-[0_14px_18px_rgba(0,0,0,0.14)]"
                }
              />
            </Parallax>
          </li>
          )
        )}
      </ul>
    </section>
  );
}

const REASONS = [
  { title: "Any Idea", body: "Send a photo or describe it.", icon: "/icon-idea.png" },
  { title: "We Figure It Out", body: "No packaging knowledge needed.", icon: "/icon-puzzle.png" },
  { title: "See Before We Make", body: "Review your proof first.", icon: "/icon-eye.png" },
  { title: "Made + Delivered", body: "We handle production and delivery.", icon: "/icon-cube.png" },
];

function WhyUs() {
  return (
    <section id="about" aria-labelledby="why-heading" className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 pb-12 pt-10 sm:px-6 lg:px-10 lg:pb-20 lg:pt-16">
      <div className="rounded-[28px] bg-[#0a0a0a] p-4 text-white sm:p-8">
        <h2 id="why-heading" className="flex items-center gap-3 px-1 text-[clamp(24px,7vw,34px)] font-black tracking-[-0.04em]">
          Why DYE CUT LAB?
          <span aria-hidden="true" className="h-[3px] w-9 rounded-full bg-[var(--dcl-lime)]" />
        </h2>
        <ul className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          {REASONS.map(({ title, body, icon }) => (
            <li key={title} className="flex flex-col items-center rounded-[20px] bg-white px-3 py-5 text-center text-black">
              <Image src={icon} alt="" width={128} height={128} className="h-14 w-14 object-contain" />
              <span className="mt-2.5 text-[15px] font-extrabold leading-tight">{title}</span>
              <span className="mt-1 text-[12.5px] leading-snug text-zinc-600">{body}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* 5 · Anywhere, FAQ, question, footer                             */
/* ---------------------------------------------------------------- */

/* Dotted world map generated once from real geography with the
   `dotted-map` package (not a site dependency); lime dots mark key
   markets. Regenerate the SVG to change pins or colours. */
function DottedMap() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimisation needed
    <img src="/world-dots.svg" alt="" aria-hidden="true" width={109} height={52} loading="lazy" className="h-auto w-full" />
  );
}
function Anywhere() {
  return (
    <section aria-labelledby="anywhere-heading" className="rounded-[28px] bg-[var(--dcl-lime-soft)] p-5 sm:p-8">
      <div className="flex items-center gap-3">
        <GlobeIcon className="h-12 w-12 shrink-0" />
        <h2 id="anywhere-heading" className="text-[24px] font-black leading-[1.05] tracking-[-0.04em]">
          Work With Us Anywhere.
        </h2>
      </div>
      <p className="mt-2 text-[15px] font-medium text-zinc-700">We support brands around the world.</p>
      <div className="mt-4">
        <DottedMap />
      </div>
    </section>
  );
}

/* Answers kept general on purpose — every product is quoted case by case.
   Update with the client's exact policies (minimums, lead times). */
const FAQS = [
  {
    q: "What's the minimum order?",
    a: "It depends on the product and finish. Text us your idea and quantity and we'll tell you what's possible.",
  },
  {
    q: "Do you help with the design?",
    a: "Yes. Send a photo, sketch or description and our team helps with materials, size and artwork before anything is made.",
  },
  {
    q: "What file types can I send?",
    a: "Photos, sketches, PDFs and design files (AI, PSD, PNG, SVG) all work. If you don't have a file yet, just describe it.",
  },
  {
    q: "How long does production take?",
    a: "Timing depends on the product and quantity. You'll get a timeline with your quote, before you pay.",
  },
  {
    q: "Do you ship internationally?",
    a: "We work with brands around the world. Tell us where you are and we'll include shipping in your quote.",
  },
  {
    q: "What can I make with DCL?",
    a: "Custom boxes, mylar and die-cut bags, labels, novelties and more. If you can imagine it, ask us.",
  },
];

function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-6">
      <Eyebrow>FAQ</Eyebrow>
      <h2 id="faq-heading" className={`mt-3 ${H2}`}>
        Quick
        <br />
        Answers.
      </h2>
      <div className="mt-4 divide-y-2 divide-zinc-100 border-y-2 border-zinc-100">
        {FAQS.map(({ q, a }) => (
          <details key={q} className="group">
            <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 py-3 text-[15px] font-bold [&::-webkit-details-marker]:hidden">
              {q}
              <PlusIcon className="h-5 w-5 shrink-0 transition-transform group-open:rotate-45" />
            </summary>
            <p className="pb-4 pr-8 text-[14px] leading-relaxed text-zinc-700">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function QuestionPanel() {
  return (
    <section aria-labelledby="question-heading" className="rounded-[28px] bg-[#0a0a0a] p-5 text-white sm:p-8">
      <h2 id="question-heading" className="text-[26px] font-black leading-none tracking-[-0.04em]">
        Have a Question?
      </h2>
      <p className="mt-2 flex items-center gap-2 text-[15px] font-semibold">
        <ChatDotsIcon className="h-7 w-7 text-[var(--dcl-lime)] [&_circle]:fill-black" />
        Text us anytime.
      </p>
      <a
        href={SMS_NUMBER_ACCEPTS_TEXTS ? smsHref() : undefined}
        className="mt-4 flex min-h-[56px] items-center justify-between rounded-full bg-[var(--dcl-lime)] px-6 text-[16px] font-extrabold text-black transition active:scale-[0.98]"
      >
        Text {SMS_NUMBER.display}
        <ArrowIcon className="h-5 w-5" />
      </a>
    </section>
  );
}

const SOCIAL_LINKS: { label: string; href: string | null; Icon: typeof InstagramIcon }[] = [
  { label: "Instagram", href: "https://www.instagram.com/dyecutlab/", Icon: InstagramIcon },
  { label: "TikTok", href: null, Icon: TikTokIcon },
];

function LandingFooter() {
  return (
    <footer className="border-t-2 border-zinc-100">
      <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_auto_auto] lg:items-center lg:gap-10 lg:px-10">
        <Wordmark compact />
        {/* Phones: one full-width row per link with an arrow, like the mockup.
            Desktop: a plain inline row. */}
        <nav
          aria-label="Footer"
          className="divide-y-2 divide-zinc-100 border-y-2 border-zinc-100 text-[16px] font-bold lg:flex lg:gap-8 lg:divide-y-0 lg:border-0 lg:text-[15px]"
        >
          {[
            ["About", "/#about"],
            ["Contact", "/#order"],
            ["Privacy", "/privacy"],
            ["Terms", "/terms"],
          ].map(([label, href]) => (
            <Link
              key={label}
              href={href}
              className="flex min-h-[54px] items-center justify-between py-3 hover:underline lg:min-h-0 lg:py-1"
            >
              {label}
              <ArrowIcon className="h-4 w-4 lg:hidden" />
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-5">
          {SOCIAL_LINKS.map(({ label, href, Icon }) =>
            href ? (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={`DYE CUT LAB on ${label}`}>
                <Icon className="h-6 w-6" />
              </a>
            ) : (
              <span key={label} title={`${label} — coming soon`} className="text-zinc-400">
                <Icon className="h-6 w-6" />
                <span className="sr-only">{label} coming soon</span>
              </span>
            )
          )}
        </div>
        <p className="text-[12px] text-zinc-500 lg:col-span-3">© {new Date().getFullYear()} DYE CUT LAB. All rights reserved.</p>
      </div>
    </footer>
  );
}
