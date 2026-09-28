import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { brandFont } from "../fonts";
import SignInCard from "./SignInCard";
import { Footer, Header } from "../updates/SiteChrome";
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
      <main className="flex min-h-screen flex-col overflow-x-hidden bg-white text-[#0a0a0a] antialiased">
        <Header />

        <section className="mx-auto grid w-full max-w-6xl flex-1 content-center gap-8 px-4 pb-14 pt-8 sm:px-6 sm:pt-12 lg:grid-cols-[1fr_minmax(0,460px)] lg:items-center lg:gap-16 lg:px-10 lg:pb-20 lg:pt-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border-2 border-black bg-white px-3 py-1 text-[12px] font-extrabold">
              <span className="h-2 w-2 rounded-full bg-[var(--dcl-lime-deep)]" />
              Your account
            </p>
            <h1 className="dcl-rise mt-4 text-[clamp(38px,10vw,76px)] font-black leading-[1.02] tracking-[-0.045em]">
              Welcome to
              <br />
              the{" "}
              <span className="relative inline-block whitespace-nowrap">
                <span className="relative z-10 inline-block -rotate-2 rounded-[0.35em] bg-[var(--dcl-lime)] px-[0.16em] pb-[0.05em]">
                  lab.
                </span>
                <Burst className="absolute -right-[0.62em] top-[0.02em] h-[0.5em] w-[0.5em] text-[var(--dcl-lime-deep)]" />
              </span>
            </h1>
            <p className="mt-4 max-w-[34ch] text-[clamp(15px,4.2vw,21px)] font-semibold leading-snug text-zinc-900">
              Sign in with your email and password, or with Google — your projects, quotes and orders stay in
              one place.
            </p>
          </div>

          <SignInCard next={next} error={one("error")} />
        </section>

        <Footer />
      </main>
    </div>
  );
}
