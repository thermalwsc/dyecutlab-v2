import type { Metadata } from "next";
import SignupForm from "./updates/SignupForm";

export const metadata: Metadata = {
  title: "Get DYE CUT LAB + DICI Updates",
  description:
    "Sign up for early access, new packaging drops and DICI feature releases from DYE CUT LAB.",
  openGraph: {
    title: "Get DYE CUT LAB + DICI Updates",
    description:
      "Sign up for early access, new packaging drops and DICI feature releases from DYE CUT LAB.",
    type: "website",
  },
};

/* Landing page is now the default route (/).
   Sign-up form lives in ./updates/SignupForm.tsx (client component)
   so this file can stay a server component and export metadata. */
export default function LandingPage() {
  return <SignupForm />;
}
