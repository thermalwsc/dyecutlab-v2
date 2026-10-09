import type { Metadata } from "next";
import { brandFont } from "./fonts";
import LandingPage from "./updates/LandingPage";
import { SHOW_BETA_SIGNUP } from "../lib/siteFlags";

const DESCRIPTION = SHOW_BETA_SIGNUP
  ? "Boxes, mylar bags, novelties and more for your brand. Join the DYE CUT LAB beta for early access to new tools."
  : "Boxes, mylar bags, novelties and more for your brand. Send us your idea and we'll help make it.";

/* The picture shown when the link is shared by text, WhatsApp or social:
   the DCL logo on white, 1200 x 630 (public/og-image.png). Messaging apps
   remember previews, so after changing it test with a fresh link such as
   dyecutlab.com/?v=2. */
const SHARE_IMAGE = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "DYE CUT LAB logo",
};

export const metadata: Metadata = {
  title: "DYE CUT LAB — Custom Packaging Made Simple",
  description: DESCRIPTION,
  openGraph: {
    title: "DYE CUT LAB — Custom Packaging Made Simple",
    description: DESCRIPTION,
    siteName: "DYE CUT LAB",
    url: "/",
    type: "website",
    images: [SHARE_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "DYE CUT LAB — Custom Packaging Made Simple",
    description: DESCRIPTION,
    images: [SHARE_IMAGE.url],
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
