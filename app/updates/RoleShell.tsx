import type { ReactNode } from "react";
import { brandFont } from "../fonts";
import { Footer, Header } from "./SiteChrome";

/* Shared frame for the signed-in pages (/account, /admin, /factory): the same
   header, footer and typography as the public pages, plus a badge/title block.
   Server component — the header is only a client island for the menu. */

export function RoleShell({
  badge,
  title,
  intro,
  children,
}: {
  badge: string;
  title: ReactNode;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`${brandFont.className} dcl-landing`}>
      <main className="min-h-screen overflow-x-hidden bg-white text-[#0a0a0a] antialiased">
        <Header />

        <section className="mx-auto w-full max-w-6xl px-4 pb-14 pt-8 sm:px-6 sm:pt-12 lg:px-10 lg:pt-16">
          <p className="inline-flex items-center gap-2 rounded-full border-2 border-black bg-white px-3 py-1 text-[12px] font-extrabold">
            <span className="h-2 w-2 rounded-full bg-[var(--dcl-lime-deep)]" />
            {badge}
          </p>

          <h1 className="dcl-rise mt-4 text-[clamp(32px,8.4vw,60px)] font-black leading-[1.03] tracking-[-0.045em]">
            {title}
          </h1>

          <p className="mt-3 max-w-[52ch] text-[15px] font-semibold leading-snug text-zinc-800 sm:text-[17px]">
            {intro}
          </p>

          {children}
        </section>

        <Footer />
      </main>
    </div>
  );
}

/* Panel used by the role pages so /admin, /factory and /admin/accounts don't
   each invent their own card. */
export function RoleCard({
  title,
  tone = "lime",
  children,
}: {
  title: string;
  tone?: "lime" | "dark" | "white";
  children: ReactNode;
}) {
  const toneClass =
    tone === "dark"
      ? "bg-[#0a0a0a] text-white"
      : tone === "white"
        ? "border-2 border-black bg-white"
        : "bg-[var(--dcl-lime-soft)]";

  const headingClass = tone === "dark" ? "text-[var(--dcl-lime)]" : "text-black";
  const bodyClass = tone === "dark" ? "text-zinc-300" : "text-zinc-800";

  return (
    <div className={`rounded-[28px] p-5 sm:rounded-[32px] sm:p-8 ${toneClass}`}>
      <h2 className={`text-[clamp(20px,5.4vw,26px)] font-black leading-tight tracking-[-0.04em] ${headingClass}`}>
        {title}
      </h2>
      <div className={`mt-3 space-y-3 text-[15px] leading-relaxed ${bodyClass}`}>{children}</div>
    </div>
  );
}
