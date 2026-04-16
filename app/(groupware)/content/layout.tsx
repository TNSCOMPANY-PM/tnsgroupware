"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { FileText, GitCompareArrows, BookOpen, TrendingUp, Globe, BarChart3, History } from "lucide-react";

const TABS = [
  { href: "/content/brand",    label: "브랜드 (A)", icon: FileText,         color: "violet" },
  { href: "/content/compare",  label: "비교 (B)",   icon: GitCompareArrows, color: "sky" },
  { href: "/content/guide",    label: "가이드 (C)", icon: BookOpen,         color: "emerald" },
  { href: "/content/trend",    label: "트렌드 (D)", icon: TrendingUp,       color: "amber" },
  { href: "/content/external",  label: "외부채널",    icon: Globe,            color: "rose" },
  { href: "/content/datasheet", label: "데이터시트", icon: BarChart3,        color: "indigo" },
  { href: "/content/posts",    label: "발행 이력",  icon: History,          color: "slate" },
] as const;

export default function ContentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="border-b border-slate-200 bg-white px-6 pt-4">
        <h1 className="text-base font-semibold text-slate-800 mb-1">콘텐츠 발행</h1>
        <p className="text-xs text-slate-400 mb-3">v3 전략: 타입 A(브랜드) / B(비교) / C(가이드) / D(트렌드) + 외부채널</p>
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map(t => {
            const active = pathname?.startsWith(t.href);
            const Icon = t.icon;
            return (
              <Link key={t.href} href={t.href}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-3 py-2 border-b-2 font-medium transition-colors whitespace-nowrap",
                  active ? `border-${t.color}-500 text-${t.color}-600` : "border-transparent text-slate-400 hover:text-slate-600",
                )}>
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex-1 overflow-y-auto p-6">{children}</div>
    </div>
  );
}
