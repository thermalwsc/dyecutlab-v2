"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "../../lib/supabase/browser";

/* The invite email cannot use PKCE (a Supabase limitation for invites), so its
   tokens arrive in the URL *hash* — and a hash never reaches the server. The
   Supabase browser client reads it (detectSessionInUrl), stores the session in
   the same cookies the rest of the site uses, and then we reload the page once
   so the server can render the password form.

   If no session shows up, the link was already used or has expired — say that
   instead of spinning forever. */

const WAIT_MS = 6000;

export default function InviteLanding() {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    let settled = false;

    function reloadWithSession() {
      if (settled) return;
      settled = true;
      window.location.replace("/set-password");
    }

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) reloadWithSession();
    });

    /* The hash may already have been processed before this effect ran. */
    supabase.auth
      .getSession()
      .then(({ data: sessionData }) => {
        if (sessionData.session) reloadWithSession();
      })
      .catch(() => setExpired(true));

    const timer = window.setTimeout(() => {
      if (!settled) setExpired(true);
    }, WAIT_MS);

    return () => {
      data.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  if (expired) {
    return (
      <div role="alert" className="rounded-[28px] border-2 border-red-300 bg-red-50 p-6 sm:rounded-[32px] sm:p-8">
        <h2 className="text-[20px] font-black tracking-[-0.03em] text-red-800">
          That link has expired or was already used.
        </h2>
        <p className="mt-2 text-[14px] font-medium leading-relaxed text-red-700">
          Ask us to send a new one, or request it yourself from the sign-in page — it only takes a minute.
        </p>
        <Link
          href="/signin"
          className="mt-5 inline-flex h-12 items-center rounded-full border-[3px] border-black bg-white px-6 text-[15px] font-extrabold transition hover:bg-black hover:text-white"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="rounded-[28px] bg-[var(--dcl-lime-soft)] p-6 sm:rounded-[32px] sm:p-8">
      <span className="inline-block rounded-full bg-[var(--dcl-lime)] px-3 py-1 text-[12px] font-extrabold">
        Opening your link
      </span>
      <h2 className="mt-4 text-[clamp(22px,6vw,28px)] font-black leading-tight tracking-[-0.04em]">
        One moment…
      </h2>
      <p className="mt-2 text-[14px] font-medium leading-relaxed text-zinc-800">
        We&rsquo;re signing you in from the link in your email. The password form appears in a second.
      </p>
    </div>
  );
}
