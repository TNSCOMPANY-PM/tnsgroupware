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
import { SidebarProvider } from "@/contexts/SidebarContext";

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
      <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden print:block print:h-auto print:overflow-visible">
        <div className="print:hidden"><Sidebar /></div>
        <div className="md:ml-64 flex min-w-0 flex-1 flex-col print:ml-0 print:block">
          <div className="print:hidden"><Header /></div>
          <main className="flex-1 overflow-y-auto overflow-x-auto min-h-0 print:overflow-visible print:flex-none">
            <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 md:p-10 lg:p-12 print:p-0 print:max-w-none">
              {children}
            </div>
          </main>
        </div>
      </div>
      </SidebarProvider>
      </GrantedLeavesProvider>
      </PlannedLeavesProvider>
      </ProfileOverridesProvider>
      <div className="print:hidden"><AIChatWidget /></div>
      </RealtimeToastProvider>
    </PermissionProvider>
  );
}
