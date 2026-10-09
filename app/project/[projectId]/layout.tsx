import { redirect } from "next/navigation";
import { requireRole } from "../../../lib/auth/guard";
import { APP_ROLES } from "../../../lib/auth/roles";

/* The project page includes the customer's conversation with the assistant, so
   factory accounts don't use it: they get their own brief-only view in the
   factory portal. A factory that opens a project address by hand is sent there. */
export default async function ProjectDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { role } = await requireRole(APP_ROLES, { next: `/project/${encodeURIComponent(projectId)}` });

  if (role === "factory") redirect(`/factory/projects/${encodeURIComponent(projectId)}`);

  return <>{children}</>;
}
