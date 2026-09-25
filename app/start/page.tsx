import type { Metadata } from "next";
import { brandFont } from "../fonts";
import StartForm from "./StartForm";
import { CONTACT } from "../../lib/contact";
import { Footer, Header, TrustRow } from "../updates/SiteChrome";

/* TEMPORARY stand-in for the DICI chat (/app) while it is being fixed.
   Removal steps live next to START_PROJECT_HREF in lib/contact.ts. */

export const metadata: Metadata = {
  title: "Start Your Project — DYE CUT LAB",
  description:
    `Tell us what you want made. ${CONTACT.personName} from DYE CUT LAB texts you back, fast.`,
};

export default function StartPage() {
  return (
    <div className={`${brandFont.className} dcl-landing`}>
      <main className="min-h-screen overflow-x-hidden bg-white text-[#0a0a0a] antialiased">
        <Header />
        <StartForm />
        <TrustRow />
        <Footer />
      </main>
    </div>
  );
}
