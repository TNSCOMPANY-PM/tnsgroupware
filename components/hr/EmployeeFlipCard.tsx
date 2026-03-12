"use client";

import { Users, Calendar, Phone, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmployeeFlipCardData {
  id: string;
  name: string;
  position: string;
  department: string;
  /** 뒷면: 팀(조직) */
  team: string;
  /** 뒷면: 입사일 (예: 2019. 7. 9) */
  joinDate: string;
  /** 뒷면: 연락처 */
  contact: string;
  /** 프로필 시트 연동용 사용자 id (DUMMY_USERS) */
  userId?: string;
}

interface EmployeeFlipCardProps {
  data: EmployeeFlipCardData;
  onClick?: () => void;
  /** 뒷면 퀵 버튼: 재직증명서 발급 시트 열기 */
  onRequestCertificate?: () => void;
}

export function EmployeeFlipCard({ data, onClick, onRequestCertificate }: EmployeeFlipCardProps) {
  const initial = data.name.charAt(0);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick?.()}
      className="group h-[320px] w-full cursor-pointer font-sans"
      style={{ perspective: "1000px" }}
    >
      <div
        className="relative h-full w-full transition-transform duration-700 group-hover:[transform:rotateY(180deg)]"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* 앞면: 프로필 요약 */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center rounded-3xl border border-white/50 bg-white/70 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl"
          )}
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="mb-4 flex size-24 shrink-0 items-center justify-center rounded-full bg-slate-200/80 text-3xl font-bold text-slate-600">
            {initial}
          </div>
          <p className="text-center text-xl font-bold text-slate-800">
            {data.name}
          </p>
          <p className="mt-0.5 text-center text-lg font-semibold text-slate-700">
            {data.position}
          </p>
          <p className="mt-2 text-center text-sm text-slate-500">
            {data.department}
          </p>
        </div>

        {/* 뒷면: 팀 · 입사일 · 연락처 */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col justify-center gap-5 rounded-3xl bg-gradient-to-br from-slate-800 to-slate-900 p-6 text-white shadow-xl"
          )}
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <Users className="size-4 text-emerald-300/90" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/50">팀</p>
              <p className="text-sm font-medium text-white/95">{data.team}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <Calendar className="size-4 text-emerald-300/90" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/50">입사일</p>
              <p className="text-sm font-medium text-white/95">{data.joinDate}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <Phone className="size-4 text-emerald-300/90" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/50">연락처</p>
              <p className="text-sm font-medium text-white/95">{data.contact}</p>
            </div>
          </div>
          {onRequestCertificate && (
            <div className="mt-auto pt-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestCertificate();
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onRequestCertificate())}
                className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-white/90 transition-colors hover:bg-white/20"
                title="재직증명서 발급"
              >
                <FileDown className="size-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
