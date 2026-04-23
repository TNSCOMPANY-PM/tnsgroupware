"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Pencil, Globe, History } from "lucide-react";

const TABS = [
  { href: "/content/editor",   label: "콘텐츠 생성", icon: Pencil,          color: "violet" },
  { href: "/content/posts",    label: "발행 관리",  icon: History,          color: "slate" },
  { href: "/content/external", label: "외부 백링크", icon: Globe,            color: "rose" },
] as const;

export default function ContentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="border-b border-slate-200 bg-white px-6 pt-4">
        <h1 className="text-base font-semibold text-slate-800 mb-1">콘텐츠 발행</h1>
        <p className="text-xs text-slate-400 mb-3">D0~D3 독자 여정 기반 단일 에디터</p>
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
