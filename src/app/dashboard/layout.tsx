import { DashboardShell } from "@/components/layout/dashboard-shell";
import { auth } from "@/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = session?.user
    ? { name: session.user.name ?? null, email: session.user.email ?? null }
    : null;

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
