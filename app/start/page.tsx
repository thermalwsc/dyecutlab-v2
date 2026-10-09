import type { Metadata } from "next";
import { brandFont } from "../fonts";
import StartForm, { type StartAccount } from "./StartForm";
import { Footer, Header, TrustRow } from "../updates/SiteChrome";
import { getViewer, viewerName } from "../../lib/auth/viewer";
import { getServerSupabase } from "../../lib/supabase/server";
import { SHOW_TRUST_ROW } from "../../lib/siteFlags";

/* TEMPORARY stand-in for the DICI chat (/app) while it is being fixed.
   Removal steps live next to START_PROJECT_HREF in lib/contact.ts. */

export const metadata: Metadata = {
  title: "Start Your Project — DYE CUT LAB",
  description:
    "Tell us what you want made. We save it, then you send it by text and our team replies fast.",
};

/* Signed-in customers don't retype who they are: name and email come from
   their account, and the phone from the number saved on their customer record
   (if any). Guests get the plain form. The API re-checks the session itself,
   so nothing here is trusted to say who sent a request. */
async function getAccount(): Promise<StartAccount | null> {
  try {
    const supabase = await getServerSupabase();
    const viewer = await getViewer(supabase);
    if (!viewer.user?.email) return null;

    const { data } = await supabase
      .from("clients")
      .select("phone")
      .eq("owner_id", viewer.user.id)
      .maybeSingle();

    return {
      name: viewerName(viewer),
      email: viewer.user.email,
      phone: typeof data?.phone === "string" && data.phone ? data.phone : null,
    };
  } catch (error) {
    console.error("START PAGE ACCOUNT LOOKUP:", error);
    return null;
  }
}

export default async function StartPage() {
  const account = await getAccount();

  return (
    <div className={`${brandFont.className} dcl-landing`}>
      <main className="min-h-screen overflow-x-hidden bg-white text-[#0a0a0a] antialiased">
        <Header />
        <StartForm account={account} />
        {SHOW_TRUST_ROW && <TrustRow />}
        <Footer />
      </main>
    </div>
  );
}
