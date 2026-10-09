import type { Metadata } from "next";
import { requireRole } from "../../lib/auth/guard";

export const metadata: Metadata = {
  title: "Start Your Project — DYE CUT LAB",
  description:
    "Tell DICI what you want to make — custom print and packaging in one conversation.",
};

/* The DICI chat reads and writes account-scoped project data, so it needs a
   signed-in customer or team member (server check; proxy.ts only does the fast
   path). Factory accounts are sent to the factory portal instead. */
export default async function AppRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["customer", "dcl_staff", "dcl_admin"], { next: "/app" });
  return <>{children}</>;
}
