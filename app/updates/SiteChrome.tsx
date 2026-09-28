"use client";

/* Site-wide pieces shared by the landing page (/) and the temporary
   Start-your-project page (/start): wordmark, header + menu, trust row,
   footer. */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
import { ROLE_HOME } from "../../lib/auth/roles";
import { getBrowserSupabase } from "../../lib/supabase/browser";

/* Social profiles. A null href renders the icon dimmed with a "Soon"
   badge until the profile exists. */
const SOCIAL_LINKS: { label: string; href: string | null; Icon: typeof InstagramIcon }[] = [
  { label: "Instagram", href: "https://www.instagram.com/dyecutlab/", Icon: InstagramIcon },
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

type SessionUser = {
  initial: string;
  label: string;
  email: string;
  /** Where this account belongs — /account, /admin or /factory. */
  home: string;
  homeLabel: string;
} | null;

/* Who is signed in and where they belong, for the header only (display, not
   security — pages and routes check on the server). undefined = still loading.
   The destination comes from /api/auth/home, so the header can't disagree with
   the role-based landing pages. */
function useSessionUser(): SessionUser | undefined {
  const [session, setSession] = useState<
    ({ id: string; label: string; initial: string; email: string } | null) | undefined
  >(undefined);
  /* null until the server tells us where this account belongs; a customer
     account is the fallback while it loads. */
  const [home, setHome] = useState<{ path: string; label: string } | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    const toSession = (
      user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null | undefined
    ) => {
      if (!user) return null;
      const meta = user.user_metadata ?? {};
      const label = String(meta.full_name ?? meta.name ?? user.email ?? "Account");
      return {
        id: user.id,
        label,
        initial: label.trim().charAt(0).toUpperCase() || "A",
        email: user.email ?? "",
      };
    };

    supabase.auth.getSession().then(({ data }) => setSession(toSession(data.session?.user)));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(toSession(next?.user)));
    return () => data.subscription.unsubscribe();
  }, []);

  const sessionId = session?.id ?? null;

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/home", { cache: "no-store" });
        const body = (res.ok ? await res.json() : {}) as { path?: unknown };
        const path = typeof body.path === "string" && body.path.startsWith("/") ? body.path : ROLE_HOME.customer.path;
        if (cancelled) return;

        setHome({
          path,
          label: path.startsWith("/admin")
            ? ROLE_HOME.dcl_admin.label
            : path.startsWith("/factory")
              ? ROLE_HOME.factory.label
              : ROLE_HOME.customer.label,
        });
      } catch {
        /* keep the customer default */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (session === undefined) return undefined;
  if (!session) return null;

  const destination = home ?? { path: ROLE_HOME.customer.path, label: ROLE_HOME.customer.label };
  return { ...session, home: destination.path, homeLabel: destination.label };
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const user = useSessionUser();

  /* The account menu is a small popover: close it on Escape or a click outside
     so it behaves like the menu people expect on desktop. */
  useEffect(() => {
    if (!accountOpen) return;

    function onPointerDown(event: PointerEvent) {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  return (
    <header className="relative z-40">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 pt-5 sm:px-6 lg:px-10">
        <Wordmark />

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Reserve the space while the session loads so nothing jumps. */}
          {user === undefined ? (
            <span aria-hidden="true" className="h-12 w-12 sm:w-[112px]" />
          ) : user ? (
            <div ref={accountRef} className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((value) => !value)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                aria-label={`Your account (${user.label})`}
                className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-black bg-[var(--dcl-lime)] text-[18px] font-black transition active:scale-95"
              >
                {user.initial}
              </button>

              {accountOpen && (
                <div
                  role="menu"
                  aria-label="Account"
                  className="absolute right-0 top-[calc(100%+10px)] w-[min(280px,calc(100vw-32px))] rounded-[24px] border-2 border-black bg-white p-2 text-left shadow-[6px_6px_0_#0a0a0a]"
                >
                  <p className="px-4 pb-0.5 pt-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">
                    Signed in
                  </p>
                  <p className="break-all px-4 pb-2 text-[14px] font-extrabold text-black">{user.email}</p>

                  <Link
                    href={user.home}
                    onClick={() => setAccountOpen(false)}
                    role="menuitem"
                    className="block rounded-2xl px-4 py-3 text-[16px] font-extrabold transition hover:bg-[var(--dcl-lime-soft)]"
                  >
                    {user.homeLabel}
                  </Link>

                  <form action="/auth/signout" method="post">
                    <button
                      type="submit"
                      role="menuitem"
                      className="block w-full rounded-2xl px-4 py-3 text-left text-[16px] font-extrabold text-zinc-600 transition hover:bg-[var(--dcl-lime-soft)] hover:text-black"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/signin"
              aria-label="Sign in"
              className="flex h-12 w-12 items-center justify-center gap-2 rounded-full border-2 border-black bg-white text-[15px] font-extrabold transition hover:bg-black hover:text-white active:scale-95 sm:w-auto sm:px-5"
            >
              <UserIcon className="h-5 w-5" />
              <span className="hidden sm:inline">Sign in</span>
            </Link>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen((value) => !value);
              setAccountOpen(false);
            }}
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

          <div className="mt-1 border-t-2 border-dashed border-black/10 pt-1">
            {user ? (
              <>
                <p className="break-all px-4 pb-2 text-[13px] font-bold text-zinc-600">{user.email}</p>
                <Link
                  href={user.home}
                  onClick={() => setOpen(false)}
                  className="block rounded-2xl px-4 py-3 text-[16px] font-extrabold transition hover:bg-[var(--dcl-lime-soft)]"
                >
                  {user.homeLabel}
                </Link>
                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    className="block w-full rounded-2xl px-4 py-3 text-left text-[16px] font-extrabold text-zinc-600 transition hover:bg-[var(--dcl-lime-soft)] hover:text-black"
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/signin"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-2xl bg-[var(--dcl-lime)] px-4 py-3 text-[16px] font-extrabold"
              >
                Sign in
                <UserIcon className="h-5 w-5" />
              </Link>
            )}
          </div>
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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6 sm:py-8 lg:px-10">
        <Wordmark inverted compact />

        {/* Own row on phones so the four links + socials never overflow. */}
        <div className="flex items-center justify-between gap-2.5 sm:justify-end sm:gap-5">
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium sm:gap-3 sm:text-[15px]">
            <Link href="/#about" className="hover:text-[var(--dcl-lime)]">About</Link>
            <span aria-hidden="true" className="text-zinc-600">|</span>
            <Link href="/#order" className="hover:text-[var(--dcl-lime)]">Contact</Link>
            <span aria-hidden="true" className="text-zinc-600">|</span>
            <Link href="/privacy" className="hover:text-[var(--dcl-lime)]">Privacy</Link>
            <span aria-hidden="true" className="text-zinc-600">|</span>
            <Link href="/terms" className="hover:text-[var(--dcl-lime)]">Terms</Link>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            {SOCIAL_LINKS.map(({ label, href, Icon }) =>
              href ? (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`DYE CUT LAB on ${label}`}
                  className="hover:text-[var(--dcl-lime)]"
                >
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                </a>
              ) : (
                <span key={label} title={`${label} — coming soon`} className="relative text-zinc-500">
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--dcl-lime)] px-1 text-[7px] font-extrabold uppercase leading-[11px] text-black sm:text-[8px]">
                    Soon
                  </span>
                  <span className="sr-only">{label} coming soon</span>
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}

/* One line of links placed after every SMS consent notice, so carriers
   reviewing the opt-in flow can reach the full terms and privacy policy. */
export function SmsLegalLinks({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const color = tone === "light" ? "text-white" : "text-black";
  return (
    <>
      {" "}
      <Link href="/terms#sms" className={`font-bold underline underline-offset-2 ${color}`}>
        SMS Terms
      </Link>{" "}
      &amp;{" "}
      <Link href="/privacy" className={`font-bold underline underline-offset-2 ${color}`}>
        Privacy Policy
      </Link>
      .
    </>
  );
}
