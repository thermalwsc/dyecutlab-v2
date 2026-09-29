import type { Metadata } from "next";
import { requireRole } from "../../lib/auth/guard";
import { APP_ROLES } from "../../lib/auth/roles";

export const metadata: Metadata = {
  title: "Start Your Project — DYE CUT LAB",
  description:
    "Tell DICI what you want to make — custom print and packaging in one conversation.",
};

/* The DICI chat reads and writes account-scoped project data, so every role
   must be signed in (server check; proxy.ts only does the fast path). */
export default async function AppRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(APP_ROLES, { next: "/app" });
  return <>{children}</>;
}
