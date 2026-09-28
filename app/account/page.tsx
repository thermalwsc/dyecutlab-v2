import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { brandFont } from "../fonts";
import { Footer, Header } from "../updates/SiteChrome";
import { ArrowIcon, Burst } from "../updates/Icons";
import { START_PROJECT_HREF } from "../../lib/contact";
import { getServerSupabase } from "../../lib/supabase/server";

export const metadata: Metadata = {
  title: "Your account — DYE CUT LAB",
  robots: { index: false },
};

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  email: "email link",
};

export default async function AccountPage() {
  const supabase = await getServerSupabase();

  /* getUser() asks the Auth server, so a stale or forged cookie can't get in. */
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin?next=/account");

  /* Role lives in public.profiles (see the auth migration). If the table
     isn't there yet, fall back to "customer" instead of failing the page. */
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  const meta = user.user_metadata ?? {};
  const name: string =
    profile?.full_name || meta.full_name || meta.name || user.email?.split("@")[0] || "there";
  const firstName = name.split(" ")[0];
  const provider = PROVIDER_LABEL[user.app_metadata?.provider ?? ""] ?? "email link";
  const role: string = profile?.role ?? "customer";

  return (
    <div className={`${brandFont.className} dcl-landing`}>
      <main className="min-h-screen overflow-x-hidden bg-white text-[#0a0a0a] antialiased">
        <Header />

        <section className="mx-auto w-full max-w-6xl px-4 pb-14 pt-8 sm:px-6 sm:pt-12 lg:px-10 lg:pt-16">
          <p className="inline-flex items-center gap-2 rounded-full border-2 border-black bg-white px-3 py-1 text-[12px] font-extrabold">
            <span className="h-2 w-2 rounded-full bg-[var(--dcl-lime-deep)]" />
            Signed in
          </p>
          <h1 className="dcl-rise mt-4 text-[clamp(36px,9.4vw,68px)] font-black leading-[1.02] tracking-[-0.045em]">
            Hi,{" "}
            <span className="relative inline-block max-w-full">
              <span className="relative z-10 inline-block max-w-full -rotate-2 truncate rounded-[0.35em] bg-[var(--dcl-lime)] px-[0.16em] pb-[0.05em] align-bottom">
                {firstName}.
              </span>
              <Burst className="absolute -right-[0.5em] -top-[0.45em] h-[0.55em] w-[0.55em] text-[var(--dcl-lime-deep)]" />
            </span>
          </h1>

          <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-start">
            <div className="rounded-[28px] bg-[#0a0a0a] p-5 text-white sm:rounded-[32px] sm:p-8">
              <h2 className="text-[clamp(22px,6.4vw,30px)] font-black leading-tight tracking-[-0.04em]">
                Your <span className="text-[var(--dcl-lime)]">projects</span>
              </h2>
              <p className="mt-2 max-w-[40ch] text-[15px] leading-relaxed text-zinc-300">
                Your projects, quotes and orders will show up here as we roll out the beta. For now, start one
                and our team will text you back.
              </p>
              <Link
                href={START_PROJECT_HREF}
                className="group mt-5 flex h-14 items-center justify-between rounded-full border-[3px] border-black bg-[var(--dcl-lime)] pl-6 pr-5 text-[16px] font-extrabold text-black"
              >
                Start a project
                <ArrowIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="rounded-[28px] bg-[var(--dcl-lime-soft)] p-5 sm:rounded-[32px] sm:p-8">
              <h2 className="text-[20px] font-black tracking-[-0.03em]">Account details</h2>
              <dl className="mt-4 grid gap-3 text-[15px]">
                <div>
                  <dt className="text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500">Name</dt>
                  <dd className="font-extrabold">{name}</dd>
                </div>
                <div>
                  <dt className="text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500">Email</dt>
                  <dd className="break-all font-extrabold">{user.email ?? "Not shared"}</dd>
                </div>
                <div>
                  <dt className="text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500">Signed in with</dt>
                  <dd className="font-extrabold">{provider}</dd>
                </div>
                {role !== "customer" && (
                  <div>
                    <dt className="text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500">Role</dt>
                    <dd className="font-extrabold capitalize">{role}</dd>
                  </div>
                )}
              </dl>

              <form action="/auth/signout" method="post" className="mt-6">
                <button
                  type="submit"
                  className="h-12 rounded-full border-[3px] border-black bg-white px-6 text-[15px] font-extrabold transition hover:bg-black hover:text-white"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </section>

        <Footer />
      </main>
    </div>
  );
}
