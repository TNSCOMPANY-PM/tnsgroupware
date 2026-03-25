import { cookies } from "next/headers";
import { PermissionProvider } from "@/contexts/PermissionContext";
import { PlannedLeavesProvider } from "@/contexts/PlannedLeavesContext";
import { GrantedLeavesProvider } from "@/contexts/GrantedLeavesContext";
import { ProfileOverridesProvider } from "@/contexts/ProfileOverridesContext";
import { RealtimeToastProvider } from "@/contexts/RealtimeToastContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { getMasterCookieName, verifyMasterToken } from "@/utils/masterAuth";
import { AIChatWidget } from "@/components/chat/AIChatWidget";

export default async function GroupwareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let initialRole: "C레벨" | undefined;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(getMasterCookieName())?.value;
    if (token) {
      const ok = await verifyMasterToken(token);
      if (ok) initialRole = "C레벨";
    }
  } catch {
    initialRole = undefined;
  }
  return (
    <PermissionProvider initialRole={initialRole}>
      <RealtimeToastProvider>
      <ProfileOverridesProvider>
      <PlannedLeavesProvider>
      <GrantedLeavesProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <Sidebar />
        <div className="ml-64 flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="flex-1 overflow-y-auto overflow-x-auto min-h-0">
            <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 md:p-10 lg:p-12">
              {children}
            </div>
          </main>
        </div>
      </div>
      </GrantedLeavesProvider>
      </PlannedLeavesProvider>
      </ProfileOverridesProvider>
      <AIChatWidget />
      </RealtimeToastProvider>
    </PermissionProvider>
  );
}
