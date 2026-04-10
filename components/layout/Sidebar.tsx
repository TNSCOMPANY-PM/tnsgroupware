"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  Target,
  FileBarChart,
  Users,
  CreditCard,
  FileStack,
  CalendarDays,
  ClipboardCheck,
  Building2,
  MessageCircle,
  FolderKanban,
  Radar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission } from "@/contexts/PermissionContext";
import { useSidebar } from "@/contexts/SidebarContext";

const navItems = [
  { href: "/dashboard",  label: "대시보드", icon: LayoutDashboard },
  { href: "/chat",    label: "AI 채팅",   icon: MessageCircle },
  { href: "/cowork",     label: "코워크",    icon: FolderKanban },
  { href: "/finance", label: "매출/매입", icon: Wallet },
  { href: "/crm",        label: "고객사 CRM", icon: Building2 },
  { href: "/goals",      label: "목표",      icon: Target },
  { href: "/calendar",   label: "캘린더",    icon: CalendarDays },
  { href: "/approvals",  label: "전자결재",  icon: ClipboardCheck },
  { href: "/frandoor",   label: "Frandoor",   icon: Radar },
  { href: "/reports",    label: "보고서",    icon: FileBarChart },
  { href: "/hr",         label: "HR",        icon: Users },
] as const;

const assetsNavItem = { href: "/assets", label: "자산/구독", icon: CreditCard };
const sheetsNavItem = { href: "/sheets", label: "관리시트", icon: FileStack };

/** 라이브(프로덕션)에서는 미완성 메뉴 숨김 */
const hideIncompleteMenus = process.env.NODE_ENV === "production";

export function Sidebar() {
  const pathname = usePathname();
  const { isCLevel, isTeamLead } = usePermission();
  const { open, close } = useSidebar();

  const showAssets = !hideIncompleteMenus && (isCLevel || isTeamLead);
  const items = [
    ...navItems,
    ...(showAssets ? [assetsNavItem] : []),
    ...(hideIncompleteMenus ? [] : [sheetsNavItem]),
  ];

  return (
    <>
      {/* 모바일 오버레이 */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={close}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen w-64 flex-shrink-0 flex-col border-r border-white/40 bg-white/80 backdrop-blur-xl transition-transform duration-300",
          // 모바일: 기본 숨김, open 시 표시
          open ? "translate-x-0" : "-translate-x-full",
          // md 이상: 항상 표시
          "md:translate-x-0"
        )}
      >
        <div className="flex h-16 items-center border-b border-white/40 px-6">
          <Link href="/dashboard" className="flex items-center gap-2" onClick={close}>
            <span className="fluid-title text-lg font-bold tracking-tighter">
              TNS 그룹웨어
            </span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {items.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={close}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                )}
              >
                <Icon className="size-5 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
