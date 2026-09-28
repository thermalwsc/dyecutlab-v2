import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { brandFont } from "../fonts";
import SignInCard from "./SignInCard";
import { Footer, Header } from "../updates/SiteChrome";
import Image from "next/image";
import { Burst } from "../updates/Icons";
import { getViewer } from "../../lib/auth/viewer";
import { resolveLandingPath } from "../../lib/auth/roles";
import { getServerSupabase, safeNextPath } from "../../lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign in — DYE CUT LAB",
  description: "Sign in to DYE CUT LAB with your email and password, or continue with Google.",
};

type Params = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SignInPage({ searchParams }: Params) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : null);
  const next = safeNextPath(one("next"));

  /* Already signed in with an active account → straight to their own area
     (/account, /admin or /factory). A disabled or banned account stays on this
     page with an explanation from the card instead of bouncing back and forth
     between here and a protected page. */
  const supabase = await getServerSupabase();
  const viewer = await getViewer(supabase);
  if (viewer.user && viewer.role) redirect(resolveLandingPath(viewer.role, next));

  return (
    <div className={`${brandFont.className} dcl-landing`}>
      <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#f6f7f2] text-[#0a0a0a] antialiased">
        <Decor />
        <div className="relative z-10">
          <Header />
        </div>

        <section className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 content-center gap-8 px-4 pb-14 pt-8 sm:px-6 sm:pt-12 lg:grid-cols-[1fr_minmax(0,540px)] lg:items-center lg:gap-14 lg:px-10 lg:pb-24 lg:pt-14">
          <div className="min-w-0 lg:pl-[8%]">
            <p className="inline-flex items-center gap-2 rounded-full border-2 border-black bg-white px-4 py-1.5 text-[13px] font-extrabold">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--dcl-lime)] ring-2 ring-[var(--dcl-lime-deep)]/30" />
              Your account
            </p>
            <h1 className="dcl-rise mt-4 text-[clamp(38px,10vw,76px)] font-black leading-[1.02] tracking-[-0.045em] lg:text-[min(5.4vw,84px)]">
              <span className="whitespace-nowrap">Welcome to</span>
              <br />
              the{" "}
              <span className="relative inline-block whitespace-nowrap">
                <span className="relative z-10 inline-block -rotate-2 rounded-[0.35em] bg-[var(--dcl-lime)] px-[0.16em] pb-[0.05em]">
                  lab.
                </span>
                <Burst className="absolute -right-[0.62em] top-[0.02em] h-[0.5em] w-[0.5em] text-[var(--dcl-lime-deep)]" />
              </span>
            </h1>
            <p className="mt-5 max-w-[34ch] text-[clamp(15px,4.2vw,21px)] font-semibold leading-snug text-zinc-800">
              Sign in with your email and password, or with Google — your projects, quotes and orders stay in
              one place.
            </p>

            <Benefits />
          </div>

          <div className="min-w-0">
            <SignInCard next={next} error={one("error")} />
          </div>
        </section>

        <div className="relative z-10">
          <Footer />
        </div>
      </main>
    </div>
  );
}

/* The three reasons to have an account, under the headline (mockup). */
const BENEFITS = [
  { label: ["Faster", "Quotes"], icon: <path d="M13 3 5 13.5h6L10 21l8-11h-6l1-7Z" /> },
  {
    label: ["Track", "Your Orders"],
    icon: (
      <>
        <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
      </>
    ),
  },
  {
    label: ["Manage", "Your Projects"],
    icon: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  },
];

function Benefits() {
  return (
    <ul className="mt-8 grid max-w-[520px] grid-cols-3 divide-x divide-zinc-300">
      {BENEFITS.map(({ label, icon }) => (
        <li key={label.join(" ")} className="flex flex-col gap-3 px-3 first:pl-0 sm:px-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--dcl-lime)]/35 sm:h-12 sm:w-12">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="h-6 w-6"
            >
              {icon}
            </svg>
          </span>
          <span className="text-[13px] font-extrabold leading-tight sm:text-[16px]">
            {label[0]}
            <br />
            <span className="sm:whitespace-nowrap">{label[1]}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* Background shapes: lime blobs, thin lime curves and a product box, all
   behind the content and hidden from screen readers. The box photo is the
   hero stack for now — drop a kraft-box photo at /signin-box.png and point
   BOX_IMAGE at it to match the mockup exactly. */
const BOX_IMAGE = { src: "/Hero-section-image.png", width: 408, height: 612 };

function Decor() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
      {/* left blob + curve */}
      <div className="absolute -left-[22vw] top-[30%] h-[58vw] max-h-[720px] w-[40vw] max-w-[520px] rounded-full bg-[var(--dcl-lime)]/70 blur-[2px]" />
      <svg viewBox="0 0 200 400" fill="none" className="absolute -left-10 top-[22%] hidden h-[340px] w-[170px] text-[var(--dcl-lime-deep)]/50 lg:block">
        <path d="M-40 10c120 20 190 120 170 260" stroke="currentColor" strokeWidth="2" />
      </svg>

      {/* bottom-right blob + curve */}
      <div className="absolute -bottom-[18vw] -right-[10vw] h-[36vw] max-h-[460px] w-[36vw] max-w-[460px] rounded-full bg-[var(--dcl-lime)]/60" />
      <svg viewBox="0 0 200 300" fill="none" className="absolute bottom-[12%] right-0 hidden h-[260px] w-[170px] text-[var(--dcl-lime-deep)]/50 lg:block">
        <path d="M200 20C120 40 60 140 70 300" stroke="currentColor" strokeWidth="2" />
      </svg>

      {/* product box, bottom-left (desktop only so it never covers the form) */}
      <Image
        src={BOX_IMAGE.src}
        alt=""
        width={BOX_IMAGE.width}
        height={BOX_IMAGE.height}
        sizes="240px"
        className="absolute -left-8 bottom-24 hidden w-[180px] -rotate-6 drop-shadow-[0_24px_30px_rgba(0,0,0,0.2)] xl:block 2xl:w-[240px]"
      />
    </div>
  );
}
