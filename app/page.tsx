import type { Metadata } from "next";
import { brandFont } from "./fonts";
import LandingPage from "./updates/LandingPage";
import { SHOW_BETA_SIGNUP } from "../lib/siteFlags";

const DESCRIPTION = SHOW_BETA_SIGNUP
  ? "Boxes, mylar bags, novelties and more for your brand. Join the DYE CUT LAB beta for early access to new tools."
  : "Boxes, mylar bags, novelties and more for your brand. Send us your idea and we'll help make it.";

export const metadata: Metadata = {
  title: "DYE CUT LAB — Custom Packaging Made Simple",
  description: DESCRIPTION,
  openGraph: {
    title: "DYE CUT LAB — Custom Packaging Made Simple",
    description: DESCRIPTION,
    type: "website",
  },
};

/* Landing page is the default route (/). Interactive parts live in
   ./updates/LandingPage.tsx (client component) so this file can stay a
   server component and export metadata. */
export default function Page() {
  return (
    <div className={`${brandFont.className} dcl-landing`}>
      <LandingPage />
    </div>
  );
}
