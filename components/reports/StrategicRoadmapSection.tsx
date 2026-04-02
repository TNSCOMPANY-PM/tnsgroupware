"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermission } from "@/contexts/PermissionContext";
import { Pencil, Check, X, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

/** 팀장 userId → 수정 가능한 로드맵 부서 목록 */
const TEAM_LEAD_TO_ROADMAP_DEPT: Record<string, string[]> = {
  "d02fd372-5869-4b17-afc6-a7b19e687621": ["티제이웹"],                       // 김동균
  "5e9b0118-b22f-4255-80db-00d2ef6cf327": ["쇼핑/플레이스", "쿠팡 & CPC"],    // 김정섭
  "26324355-dd18-438c-9e92-6f9fd66a9b45": ["경영지원"],                        // 박재민
};

const ROADMAP_STORAGE_KEY = "groupware-reports-roadmap";

export type RoadmapItem = { id: string; text: string; startDate?: string; endDate?: string };
export type RoadmapBlock = { dept: string; items: RoadmapItem[] };

export function getNextMonthKey(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  const y = d.getFullYear() % 100;
  const m = d.getMonth() + 1;
  return `${y}.${String(m).padStart(2, "0")}`;
}

export function getCurrentMonthKey(): string {
  const d = new Date();
  const y = d.getFullYear() % 100;
  const m = d.getMonth() + 1;
  return `${y}.${String(m).padStart(2, "0")}`;
}

/** monthKey("26.04") → 해당 월 1일/말일 문자열 */
function monthKeyToDates(key: string): { first: string; last: string } {
  const [yy, mm] = key.split(".").map(Number);
  const year = 2000 + (yy ?? 26);
  const month = mm ?? 4;
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const last = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { first, last };
}

function mid(first: string, last: string): string {
  const d = new Date(first);
  const e = new Date(last);
  const m = new Date((d.getTime() + e.getTime()) / 2);
  return m.toISOString().slice(0, 10);
}

export function getDefaultRoadmap(monthKey?: string): RoadmapBlock[] {
  const key = monthKey ?? getCurrentMonthKey();
  const { first, last } = monthKeyToDates(key);
  const h = mid(first, last); // 월 중간
  return [
    { dept: "쇼핑/플레이스", items: [
      { id: "1", text: "체류시간 증가, 랜덤 미션 등 신규 미션 업데이트 및 태그값 크롤링 이슈 대응", startDate: first, endDate: h },
      { id: "2", text: "AI 상품 홍보로 작업량 증대 (월 4~5만 목표), 가구매 200건 목표", startDate: first, endDate: last },
      { id: "3", text: "도보 걸음수 미션 등 업데이트 완료, 월평균 작업량 35,000건 확대 목표", startDate: h, endDate: last },
    ]},
    { dept: "쿠팡 & CPC", items: [
      { id: "4", text: "추가 개발의 어려움으로 기존 고객 유지 및 신규 영업 집중 (300슬롯 목표)", startDate: first, endDate: last },
      { id: "5", text: "광고주 상품에 맞춘 테스트 및 추천 진행", startDate: first, endDate: h },
      { id: "6", text: "신규 광고주 모집 및 기존 대행사 이슈로 인한 신규 CPC 대행사 서치 및 확보", startDate: h, endDate: last },
    ]},
    { dept: "티제이웹", items: [
      { id: "7", text: "Cursor 활용 홈페이지 제작 자동화/속도 단축 가능성 검증", startDate: first, endDate: h },
      { id: "8", text: "워드프레스 AI 유지보수 테스트 진행", startDate: h, endDate: last },
    ]},
    { dept: "경영지원", items: [
      { id: "9", text: "바이브코딩 연구 및 TNS 내부 인사·재무 솔루션 제작으로 고정비 최소화", startDate: first, endDate: last },
    ]},
  ];
}

export function loadRoadmapFromStorage(monthKey: string): RoadmapBlock[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ROADMAP_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, RoadmapBlock[]>;
    const blocks = data[monthKey];
    return Array.isArray(blocks) ? blocks : null;
  } catch {
    return null;
  }
}

export function saveRoadmapToStorage(monthKey: string, blocks: RoadmapBlock[]): void {
  try {
    const raw = localStorage.getItem(ROADMAP_STORAGE_KEY);
    const data: Record<string, RoadmapBlock[]> = raw ? JSON.parse(raw) : {};
    data[monthKey] = blocks;
    localStorage.setItem(ROADMAP_STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

async function loadRoadmapFromAPI(monthKey: string): Promise<RoadmapBlock[] | null> {
  try {
    const res = await fetch(`/api/roadmap/${encodeURIComponent(monthKey)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return Array.isArray(json.blocks) ? json.blocks : null;
  } catch {
    return null;
  }
}

async function saveRoadmapToAPI(monthKey: string, blocks: RoadmapBlock[]): Promise<void> {
  try {
    await fetch(`/api/roadmap/${encodeURIComponent(monthKey)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
  } catch {}
}

function RoadmapBlockCard({
  block,
  isEditing,
  canEdit,
  onStartEdit,
  onSave,
  onCancel,
}: {
  block: RoadmapBlock;
  isEditing: boolean;
  canEdit: boolean;
  onStartEdit: () => void;
  onSave: (items: RoadmapItem[]) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<RoadmapItem[]>(block.items);

  useEffect(() => {
    if (isEditing) setDraft(block.items.map((i) => ({ ...i })));
  }, [isEditing, block.items]);

  const addItem = () => {
    setDraft((prev) => [...prev, { id: `new-${Date.now()}`, text: "" }]);
  };

  const updateItem = (id: string, patch: Partial<RoadmapItem>) => {
    setDraft((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const removeItem = (id: string) => {
    setDraft((prev) => prev.filter((i) => i.id !== id));
  };

  if (isEditing) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/30 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">{block.dept}</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onCancel}>
              <X className="mr-1 size-4" />
              취소
            </Button>
            <Button size="sm" onClick={() => onSave(draft)}>
              <Check className="mr-1 size-4" />
              저장
            </Button>
          </div>
        </div>
        <div className="space-y-4">
          {draft.map((item) => (
            <div key={item.id} className="flex flex-wrap items-start gap-2 rounded-lg border border-slate-100 bg-white p-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  placeholder="전략/목표 내용"
                  value={item.text}
                  onChange={(e) => updateItem(item.id, { text: e.target.value })}
                  className="text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-slate-500">시작일</Label>
                    <Input
                      type="date"
                      value={item.startDate ?? ""}
                      onChange={(e) => updateItem(item.id, { startDate: e.target.value || undefined })}
                      className="h-8 w-36 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-slate-500">종료일</Label>
                    <Input
                      type="date"
                      value={item.endDate ?? ""}
                      onChange={(e) => updateItem(item.id, { endDate: e.target.value || undefined })}
                      className="h-8 w-36 text-xs"
                    />
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-slate-400 hover:text-rose-600"
                onClick={() => removeItem(item.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="mr-1 size-4" />
            항목 추가
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">{block.dept}</h3>
        {canEdit && (
          <Button variant="ghost" size="sm" className="text-slate-600" onClick={onStartEdit}>
            <Pencil className="mr-1 size-4" />
            수정
          </Button>
        )}
      </div>
      <ul className="space-y-2 text-sm text-slate-700">
        {block.items.map((item) => (
          <li key={item.id} className="flex flex-col gap-0.5">
            <div className="flex gap-2">
              <span className="text-slate-400">·</span>
              <span>{item.text || "(내용 없음)"}</span>
            </div>
            {(item.startDate || item.endDate) && (
              <div className="ml-4 text-xs text-slate-500">
                {item.startDate && item.endDate
                  ? `${item.startDate} ~ ${item.endDate}`
                  : item.startDate
                    ? `시작: ${item.startDate}`
                    : `종료: ${item.endDate}`}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface StrategicRoadmapSectionProps {
  /** 해당 로드맵이 적용되는 월 키 (예: 26.03). 보고서·목표 페이지 동일 키 사용 시 연동됨 */
  roadmapMonthKey: string;
  /** 섹션 제목 */
  title?: string;
}

function prevMK(key: string): string {
  const [yy, mm] = key.split(".").map(Number);
  const y = yy ?? 26, m = mm ?? 3;
  if (m === 1) return `${y - 1}.12`;
  return `${y}.${String(m - 1).padStart(2, "0")}`;
}
function nextMK(key: string): string {
  const [yy, mm] = key.split(".").map(Number);
  const y = yy ?? 26, m = mm ?? 3;
  if (m === 12) return `${y + 1}.01`;
  return `${y}.${String(m + 1).padStart(2, "0")}`;
}
function mkToLabel(key: string): string {
  const [yy, mm] = key.split(".").map(Number);
  return `20${String(yy ?? 26).padStart(2, "0")}년 ${mm ?? 3}월`;
}

export function StrategicRoadmapSection({
  roadmapMonthKey,
  title = "전략 로드맵",
}: StrategicRoadmapSectionProps) {
  const { isCLevel, isTeamLead, currentUserId } = usePermission();
  // 내부에서 독립적으로 월 관리 (prop은 초기값으로만 사용)
  const [activeMonthKey, setActiveMonthKey] = useState(roadmapMonthKey);
  const [roadmap, setRoadmap] = useState<RoadmapBlock[]>([]);
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setEditingDept(null);
    setLoading(true);
    loadRoadmapFromAPI(activeMonthKey).then((apiBlocks) => {
      if (apiBlocks && apiBlocks.length > 0) {
        setRoadmap(apiBlocks);
        saveRoadmapToStorage(activeMonthKey, apiBlocks);
      } else {
        const stored = loadRoadmapFromStorage(activeMonthKey);
        if (stored && stored.length > 0) {
          setRoadmap(stored);
        } else {
          // 저장된 데이터 없으면 빈 블록으로 초기화
          setRoadmap([
            { dept: "쇼핑/플레이스", items: [] },
            { dept: "쿠팡 & CPC", items: [] },
            { dept: "티제이웹", items: [] },
            { dept: "경영지원", items: [] },
          ]);
        }
      }
    }).finally(() => setLoading(false));
  }, [activeMonthKey]);

  const canEditDept = (dept: string) => {
    if (isCLevel) return true;
    if (!isTeamLead) return false;
    return TEAM_LEAD_TO_ROADMAP_DEPT[currentUserId]?.includes(dept) ?? false;
  };

  const handleSave = (dept: string, items: RoadmapItem[]) => {
    setRoadmap((prev) => {
      const next = prev.map((b) => (b.dept === dept ? { ...b, items } : b));
      saveRoadmapToStorage(activeMonthKey, next);
      saveRoadmapToAPI(activeMonthKey, next);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("roadmap-updated", { detail: { monthKey: activeMonthKey } }));
      }
      return next;
    });
    setEditingDept(null);
  };

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
          ☀ {title}
          {loading && <span className="text-xs font-normal text-slate-400">불러오는 중...</span>}
        </h2>
        {/* 월 내비게이션 */}
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 p-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setActiveMonthKey(prevMK(activeMonthKey))}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="min-w-[6.5rem] text-center text-sm font-semibold text-slate-700 tabular-nums">
            {mkToLabel(activeMonthKey)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setActiveMonthKey(nextMK(activeMonthKey))}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="space-y-5">
        {roadmap.map((block) => (
          <RoadmapBlockCard
            key={`${activeMonthKey}-${block.dept}`}
            block={block}
            isEditing={editingDept === block.dept}
            canEdit={canEditDept(block.dept)}
            onStartEdit={() => setEditingDept(block.dept)}
            onSave={(items) => handleSave(block.dept, items)}
            onCancel={() => setEditingDept(null)}
          />
        ))}
      </div>
    </section>
  );
}
