import type { Metadata } from "next";
import SignupForm from "./SignupForm";

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

/* Public lead-capture page. Sign-up form lives in SignupForm.tsx
   (client component) so this file can stay a server component and
   export metadata. */
export default function UpdatesPage() {
  return <SignupForm />;
}
