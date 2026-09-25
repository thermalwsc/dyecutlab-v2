import { brandFont } from "../fonts";
import { Footer, Header } from "./SiteChrome";

/* Shared shell for /privacy and /terms: same header, footer and type as
   the rest of the site, with readable long-form styles for the body. */
export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${brandFont.className} dcl-landing`}>
      <main className="min-h-screen overflow-x-hidden bg-white text-[#0a0a0a] antialiased">
        <Header />

        <article className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
          <h1 className="text-[clamp(34px,8vw,56px)] font-black leading-[1.02] tracking-[-0.045em]">
            {title}
          </h1>
          <p className="mt-3 inline-block rounded-full bg-[var(--dcl-lime-soft)] px-3 py-1 text-[13px] font-bold">
            Last updated {updated}
          </p>

          <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-zinc-800 [&_a]:font-bold [&_a]:underline [&_a]:decoration-[var(--dcl-lime-deep)] [&_a]:decoration-2 [&_a]:underline-offset-4 [&_h2]:pt-6 [&_h2]:text-[22px] [&_h2]:font-black [&_h2]:tracking-[-0.03em] [&_h2]:text-black [&_li]:pl-1 [&_strong]:font-bold [&_strong]:text-black [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
            {children}
          </div>
        </article>

        <Footer />
      </main>
    </div>
  );
}
