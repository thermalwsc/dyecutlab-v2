import { requireRole } from "../../lib/auth/guard";
import { APP_ROLES } from "../../lib/auth/roles";

/* Project pages show account-scoped data: sign-in required for every role.
   Which projects a user can open is decided by Row Level Security
   (own projects, the DCL team sees all, factories see assigned ones). */
export default async function ProjectLayout({ children }: { children: React.ReactNode }) {
  await requireRole(APP_ROLES, { next: "/app" });
  return <>{children}</>;
}
