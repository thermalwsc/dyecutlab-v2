"use client";

/* Site-wide pieces shared by the landing page (/) and the temporary
   Start-your-project page (/start): wordmark, header + menu, trust row,
   footer. */

import Link from "next/link";
import { useState } from "react";
import {
  BoltIcon,
  CubeLogo,
  DiamondIcon,
  FactoryIcon,
  GlobeIcon,
  InstagramIcon,
  TikTokIcon,
} from "./Icons";
import { START_PROJECT_HREF } from "../../lib/contact";

/* Social profiles — not supplied yet. Icons render unlinked until set. */
const SOCIAL_LINKS: { label: string; href: string | null; Icon: typeof InstagramIcon }[] = [
  { label: "Instagram", href: null, Icon: InstagramIcon },
  { label: "TikTok", href: null, Icon: TikTokIcon },
];

/* Absolute ("/#…") so the same menu works from /start as well as /. */
const NAV_LINKS = [
  { label: "Join the beta", href: "/#beta" },
  { label: "Order packaging", href: "/#order" },
  { label: "About", href: "/#about" },
  { label: "Contact", href: "/#order" },
  { label: "Start your project", href: START_PROJECT_HREF },
];

export function Wordmark({
  inverted = false,
  compact = false,
}: {
  inverted?: boolean;
  compact?: boolean;
}) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="DYE CUT LAB home">
      <CubeLogo
        className={`shrink-0 ${compact ? "h-7 w-7 sm:h-9 sm:w-9" : "h-9 w-9"} ${
          inverted ? "text-white" : "text-black"
        }`}
      />
      <span className="leading-none">
        <span
          className={`block font-black tracking-[-0.02em] ${
            compact ? "text-[16px] sm:text-[24px]" : "text-[22px] sm:text-[26px]"
          }`}
        >
          DYE CUT LAB
        </span>
        <span
          className={`mt-1 block whitespace-nowrap font-bold tracking-[0.2em] uppercase ${
            compact ? "text-[5.5px] sm:text-[8px]" : "text-[7.5px] sm:text-[9px]"
          } ${
            inverted ? "text-zinc-300" : "text-zinc-700"
          }`}
        >
          Custom packaging made simple
        </span>
      </span>
    </Link>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="relative z-40">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 pt-5 sm:px-6 lg:px-10">
        <Wordmark />

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-black bg-[var(--dcl-lime)] transition active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {open && (
        <nav
          id="site-menu"
          className="absolute right-4 top-[calc(100%+10px)] w-[min(280px,calc(100vw-32px))] rounded-[24px] border-2 border-black bg-white p-2 shadow-[6px_6px_0_#0a0a0a] sm:right-6 lg:right-10"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block rounded-2xl px-4 py-3 text-[16px] font-extrabold transition hover:bg-[var(--dcl-lime-soft)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

/* ---------------------------------------------------------------- */

const TRUST = [
  { label: "Fast Quotes", Icon: BoltIcon },
  { label: "Trusted Factories", Icon: FactoryIcon },
  { label: "Great Quality", Icon: DiamondIcon },
  { label: "English & Spanish", sub: "(中文支持)", Icon: GlobeIcon },
];

export function TrustRow() {
  return (
    <section id="about" aria-label="Why DYE CUT LAB" className="scroll-mt-6">
      <ul className="mx-auto grid w-full max-w-6xl grid-cols-4 divide-x-2 divide-zinc-200 px-2 py-6 sm:px-6 sm:py-14 lg:px-10">
        {TRUST.map(({ label, sub, Icon }) => (
          <li key={label} className="flex flex-col items-center gap-1.5 px-1 text-center">
            <Icon className="h-[clamp(36px,10vw,56px)] w-[clamp(36px,10vw,56px)]" />
            <span className="text-[clamp(11px,3.2vw,17px)] font-extrabold leading-tight">
              {label}
              {sub && (
                <span className="mt-0.5 block text-[clamp(10px,2.8vw,14px)] font-bold text-zinc-500">
                  {sub}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="bg-[#0a0a0a] text-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6 sm:py-8 lg:px-10">
        <Wordmark inverted compact />

        <div className="flex items-center gap-2.5 sm:gap-5">
          <nav aria-label="Footer" className="flex items-center gap-1.5 text-[12px] font-medium sm:gap-3 sm:text-[15px]">
            <Link href="/#about" className="hover:text-[var(--dcl-lime)]">About</Link>
            <span aria-hidden="true" className="text-zinc-600">|</span>
            <Link href="/#order" className="hover:text-[var(--dcl-lime)]">Contact</Link>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            {SOCIAL_LINKS.map(({ label, href, Icon }) =>
              href ? (
                <a key={label} href={href} aria-label={label} className="hover:text-[var(--dcl-lime)]">
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                </a>
              ) : (
                <span key={label} title={`${label} — link coming soon`} className="text-zinc-400">
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
