import { DashboardShell } from "@/components/layout/dashboard-shell";
import { DemoGate } from "@/components/demo-gate";
import { TerminologyProvider } from "@/lib/terminology";
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

  return (
    <DemoGate>
      <TerminologyProvider>
        <DashboardShell user={user}>{children}</DashboardShell>
      </TerminologyProvider>
    </DemoGate>
  );
}
