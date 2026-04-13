"use client";

import { Users, Calendar, Phone, FileDown, TreePalm } from "lucide-react";
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
  /** 퍼스널 컬러 (#rrggbb) */
  personalColor?: string | null;
  /** 잔여 연차 */
  remainingLeave?: number | null;
}

interface EmployeeFlipCardProps {
  data: EmployeeFlipCardData;
  onClick?: () => void;
  /** 뒷면 퀵 버튼: 재직증명서 발급 시트 열기 */
  onRequestCertificate?: () => void;
}

export function EmployeeFlipCard({ data, onClick, onRequestCertificate }: EmployeeFlipCardProps) {
  const initial = data.name.charAt(0);
  const pc = data.personalColor;

  // 퍼스널컬러로 밝은 배경색 생성 (hex → rgba 20%)
  const avatarBg = pc ? pc + "33" : undefined;
  const avatarText = pc ?? undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick?.()}
      className="group h-[380px] w-full cursor-pointer font-sans"
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
          {/* 퍼스널컬러 줄 */}
          {pc && (
            <div
              className="absolute top-0 left-0 right-0 h-1.5 rounded-t-3xl"
              style={{ background: pc }}
            />
          )}
          <div
            className="mb-5 flex size-28 shrink-0 items-center justify-center rounded-full text-4xl font-bold shadow-sm"
            style={pc ? { backgroundColor: avatarBg, color: avatarText, border: `2.5px solid ${pc}` } : { backgroundColor: "rgb(226 232 240 / 0.8)", color: "rgb(71 85 105)" }}
          >
            {initial}
          </div>
          <p className="text-center text-2xl font-bold text-slate-800">
            {data.name}
          </p>
          <p className="mt-2 text-center text-base text-slate-500">
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
          <div className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <Users className="size-5 text-emerald-300/90" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/50">팀</p>
              <p className="text-base font-medium text-white/95">{data.team}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <Calendar className="size-5 text-emerald-300/90" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/50">입사일</p>
              <p className="text-base font-medium text-white/95">{data.joinDate}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <Phone className="size-5 text-emerald-300/90" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/50">연락처</p>
              <p className="text-base font-medium text-white/95">{data.contact}</p>
            </div>
          </div>
          {data.remainingLeave != null && (
            <div className="flex items-center gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <TreePalm className="size-5 text-emerald-300/90" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-white/50">잔여 연차</p>
                <p className={cn("text-base font-medium", data.remainingLeave <= 3 ? "text-amber-300" : "text-white/95")}>
                  {data.remainingLeave}일
                </p>
              </div>
            </div>
          )}
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
