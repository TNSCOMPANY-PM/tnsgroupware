"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users, CheckSquare, Clock, ChevronRight, Search, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission } from "@/contexts/PermissionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// ─── Types ────────────────────────────────────────────────────────────────────

type CoworkMember = { employee_id: string; employee_name: string; role: string };

type CoworkCard = {
  id: string;
  title: string;
  description?: string;
  creator_name: string;
  created_at: string;
  member_count: number;
  members: CoworkMember[];
  task_counts: { todo: number; in_progress: number; done: number };
};

type Employee = { id: string; name: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-pink-500",
];

function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Member Avatars ───────────────────────────────────────────────────────────

function MemberAvatars({ members, total }: { members: CoworkMember[]; total: number }) {
  const visible = members.slice(0, 4);
  const extra = total - visible.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((m) => (
        <div
          key={m.employee_id}
          title={m.employee_name}
          className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white ring-2 ring-white",
            nameToColor(m.employee_name)
          )}
        >
          {m.employee_name.charAt(0)}
        </div>
      ))}
      {extra > 0 && (
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-slate-600 bg-slate-200 ring-2 ring-white">
          +{extra}
        </div>
      )}
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ todo, in_progress, done }: { todo: number; in_progress: number; done: number }) {
  const total = todo + in_progress + done;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs text-slate-500">
        <span>진행률</span>
        <span className="font-medium text-slate-700">{pct}%</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Skeleton Card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4 animate-pulse">
      <div className="space-y-2">
        <div className="h-4 bg-slate-200 rounded w-3/5" />
        <div className="h-3 bg-slate-100 rounded w-4/5" />
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-7 h-7 rounded-full bg-slate-200" />
        ))}
      </div>
      <div className="space-y-1.5">
        <div className="h-2 bg-slate-100 rounded w-1/4 ml-auto" />
        <div className="h-1.5 bg-slate-200 rounded w-full" />
      </div>
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-5 w-14 bg-slate-100 rounded-full" />
        ))}
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center mb-5">
        <Users className="w-10 h-10 text-blue-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-800 mb-2">아직 코워크가 없어요</h3>
      <p className="text-sm text-slate-500 mb-6 max-w-xs">
        팀원들과 함께 프로젝트를 만들고 태스크를 공유해 보세요.
      </p>
      <Button onClick={onCreate} className="gap-2">
        <Plus className="w-4 h-4" />
        새 코워크 만들기
      </Button>
    </div>
  );
}

// ─── Cowork Card ──────────────────────────────────────────────────────────────

function CoworkCardItem({ cowork, onClick, onDelete, isOwner }: { cowork: CoworkCard; onClick: () => void; onDelete: () => void; isOwner: boolean }) {
  const { todo, in_progress, done } = cowork.task_counts;
  return (
    <div
      onClick={onClick}
      className="group text-left bg-white rounded-xl shadow-sm border border-slate-100 p-5 hover:shadow-md hover:border-blue-200 transition-all duration-200 flex flex-col gap-4 cursor-pointer"
    >
      {/* Title + arrow */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 text-sm truncate group-hover:text-blue-600 transition-colors">
            {cowork.title}
          </h3>
          {cowork.description && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{cowork.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isOwner && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400 mt-0.5 transition-colors" />
        </div>
      </div>

      {/* Members */}
      <div className="flex items-center gap-2">
        <MemberAvatars members={cowork.members} total={cowork.member_count} />
        <span className="text-xs text-slate-400">{cowork.member_count}명</span>
      </div>

      {/* Progress */}
      <ProgressBar todo={todo} in_progress={in_progress} done={done} />

      {/* Status chips */}
      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
          <CheckSquare className="w-3 h-3" />
          {todo} 할일
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-600">
          <Clock className="w-3 h-3" />
          {in_progress} 진행중
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-600">
          <CheckSquare className="w-3 h-3" />
          {done} 완료
        </span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-50">
        <span>{cowork.creator_name} 생성</span>
        <span>{formatDate(cowork.created_at)}</span>
      </div>
    </div>
  );
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateModal({
  open,
  onClose,
  onCreated,
  currentUserId,
  currentUserName,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  currentUserId: string;
  currentUserName: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setEmployeeSearch("");
      setSelectedMembers([]);
      setError(null);
    }
  }, [open]);

  // Fetch employees
  useEffect(() => {
    if (!open) return;
    setLoadingEmployees(true);
    fetch("/api/employees")
      .then((r) => r.json())
      .then((data: Employee[]) => setEmployees(Array.isArray(data) ? data : []))
      .catch(() => setEmployees([]))
      .finally(() => setLoadingEmployees(false));
  }, [open]);

  const filteredEmployees = employees.filter(
    (e) =>
      e.id !== currentUserId &&
      e.name.includes(employeeSearch) &&
      !selectedMembers.some((s) => s.id === e.id)
  );

  function toggleMember(emp: Employee) {
    setSelectedMembers((prev) =>
      prev.some((m) => m.id === emp.id)
        ? prev.filter((m) => m.id !== emp.id)
        : [...prev, emp]
    );
  }

  async function handleSubmit() {
    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cowork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          memberIds: selectedMembers.map((m) => m.id),
          memberNames: selectedMembers.map((m) => m.name),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "생성에 실패했습니다.");
      }
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>새 코워크 만들기</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="cw-title">
              제목 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="cw-title"
              placeholder="코워크 이름을 입력하세요"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="cw-desc">설명</Label>
            <textarea
              id="cw-desc"
              rows={3}
              placeholder="코워크에 대한 설명을 입력하세요 (선택)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none disabled:opacity-50"
            />
          </div>

          {/* Member search */}
          <div className="space-y-1.5">
            <Label>멤버 추가</Label>

            {/* Selected tags */}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedMembers.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-1 text-xs bg-slate-100 rounded-full">
                    {m.name}
                    <button type="button" onClick={() => toggleMember(m)} className="ml-0.5 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input
                placeholder="이름으로 검색"
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                disabled={submitting}
                className="pl-8"
              />
            </div>

            {/* Employee list */}
            <div className="max-h-36 overflow-y-auto rounded-md border border-slate-200 divide-y divide-slate-100">
              {loadingEmployees ? (
                <div className="py-4 text-center text-xs text-slate-400">불러오는 중...</div>
              ) : filteredEmployees.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  {employeeSearch ? "검색 결과가 없습니다" : "추가할 수 있는 멤버가 없습니다"}
                </div>
              ) : (
                filteredEmployees.map((emp) => {
                  const selected = selectedMembers.some((m) => m.id === emp.id);
                  return (
                    <label
                      key={emp.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleMember(emp)}
                        className="accent-blue-500"
                      />
                      <div
                        className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0",
                          nameToColor(emp.name)
                        )}
                      >
                        {emp.name.charAt(0)}
                      </div>
                      <span className="text-sm text-slate-700">{emp.name}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Error */}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "생성 중..." : "만들기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CoworkPage() {
  const router = useRouter();
  const { currentUserId, currentUserName } = usePermission();
  const [coworks, setCoworks] = useState<CoworkCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchCoworks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cowork");
      if (!res.ok) throw new Error("Failed to fetch");
      const data: CoworkCard[] = await res.json();
      setCoworks(Array.isArray(data) ? data : []);
    } catch {
      setCoworks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoworks();
  }, [fetchCoworks]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">코워크</h1>
            <p className="text-sm text-slate-500 mt-0.5">팀 프로젝트와 태스크를 함께 관리하세요</p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            새 코워크
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : coworks.length === 0 ? (
          <EmptyState onCreate={() => setCreateOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {coworks.map((cw) => (
              <CoworkCardItem
                key={cw.id}
                cowork={cw}
                onClick={() => router.push(`/cowork/${cw.id}`)}
                isOwner={cw.members?.some(m => m.employee_id === currentUserId && m.role === "owner") ?? false}
                onDelete={async () => {
                  if (!confirm(`"${cw.title}" 코워크를 삭제하시겠습니까?`)) return;
                  const res = await fetch(`/api/cowork/${cw.id}`, { method: "DELETE" });
                  if (res.ok) fetchCoworks();
                  else alert("삭제 실패");
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      <CreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={fetchCoworks}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
      />
    </div>
  );
}
