"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Bell, Plus, X, ChevronLeft, ChevronRight,
  FileText, Link as LinkIcon, Trash2, AlertTriangle,
  CheckCircle2, Clock, Users, MessageCircle, Send,
  ArrowRight, Pencil, Check, Upload, Download
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission } from "@/contexts/PermissionContext";
import { type CalendarLeaveEvent } from "@/constants/leaveSchedule";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { format, parseISO, isBefore, differenceInDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay } from "date-fns";
import { ko } from "date-fns/locale";

// ─── Types ─────────────────────────────────────────────────────────────────────
type Member = { id: string; employee_id: string; employee_name: string; role: string };
type Task = {
  id: string; cowork_id: string; title: string; description?: string;
  assignee_id?: string; assignee_name?: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "normal" | "high";
  due_date?: string; order_index: number; created_at: string;
  depends_on?: string[];
};
type Comment = { id: string; task_id?: string; post_id?: string; author_name: string; content: string; created_at: string };
type Post = { id: string; cowork_id: string; title: string; content?: string; author_id: string; author_name: string; pinned: boolean; created_at: string };
type Schedule = { id: string; title: string; start_date: string; end_date?: string; assignee_name?: string; color: string };
type Document = {
  id: string; type: "file" | "link"; file_name?: string; file_url?: string;
  link_url?: string; link_title?: string; uploader_name: string; created_at: string;
};
type WorkRequest = {
  id: string; from_id: string; from_name: string; to_id: string; to_name: string;
  title: string; content?: string; status: "pending" | "accepted" | "rejected" | "done";
  due_date?: string; created_at: string;
};
type Activity = { id: string; actor_name: string; action: string; target_title?: string; created_at: string };
type Cowork = { id: string; title: string; description?: string; creator_name: string; created_by: string; memo?: string; created_at: string };
type Employee = { id: string; name: string };

// ─── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ["bg-blue-500","bg-violet-500","bg-emerald-500","bg-amber-500","bg-rose-500","bg-cyan-500","bg-indigo-500","bg-pink-500"];
function nameToColor(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length; return AVATAR_COLORS[h]; }
function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const cls = size === "md" ? "h-9 w-9 text-sm" : "h-7 w-7 text-xs";
  return <div className={cn("rounded-full flex items-center justify-center text-white font-semibold shrink-0", nameToColor(name), cls)}>{name[0]}</div>;
}

function getDueDateStyle(due?: string): string {
  if (!due) return "text-slate-400";
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(due);
  const diff = differenceInDays(d, today);
  if (diff < 0) return "text-red-600 font-semibold";
  if (diff <= 1) return "text-orange-500 font-semibold";
  return "text-slate-500";
}

const PRIORITY_LABEL: Record<string, string> = { high: "🔴 높음", normal: "⚪ 보통", low: "🔵 낮음" };
const STATUS_LABEL: Record<string, string> = { todo: "할일", in_progress: "진행중", done: "완료" };
const ACTION_LABEL: Record<string, string> = {
  cowork_created: "코워크를 생성했습니다",
  task_created: "태스크를 추가했습니다",
  task_moved: "태스크를 이동했습니다",
  task_updated: "태스크를 수정했습니다",
  document_uploaded: "문서를 업로드했습니다",
  request_sent: "업무를 요청했습니다",
  request_accepted: "업무요청을 수락했습니다",
  request_rejected: "업무요청을 거절했습니다",
  request_done: "업무를 완료했습니다",
  schedule_created: "일정을 추가했습니다",
  comment_mention: "멘션했습니다",
};

const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899"];

function getCalendarDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const days: Date[] = [];
  const startPad = first.getDay();
  for (let i = startPad; i > 0; i--) days.push(new Date(year, month, 1 - i));
  const last = new Date(year, month + 1, 0);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length < 42) days.push(new Date(year, month + 1, days.length - last.getDate() - startPad + 1));
  return days;
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function CoworkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentUserId, currentUserName } = usePermission();

  const [tab, setTab] = useState<"overview" | "kanban" | "calendar" | "board" | "docs" | "requests" | "ai">("overview");
  const [loading, setLoading] = useState(true);

  const [cowork, setCowork] = useState<Cowork | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postComments, setPostComments] = useState<Comment[]>([]);
  const [requests, setRequests] = useState<WorkRequest[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // UI state
  const [activityOpen, setActivityOpen] = useState(false);
  const [taskModal, setTaskModal] = useState<Task | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addScheduleOpen, setAddScheduleOpen] = useState(false);
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [addRequestOpen, setAddRequestOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<Schedule | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [newPostOpen, setNewPostOpen] = useState(false);
  const [requestTab, setRequestTab] = useState<"received" | "sent">("received");
  const [calMonth, setCalMonth] = useState(new Date());

  // Inline add task
  const [addingTaskCol, setAddingTaskCol] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  // 연차
  const [leaveEvents, setLeaveEvents] = useState<CalendarLeaveEvent[]>([]);
  const [showLeave, setShowLeave] = useState(false);

  // AI chat
  type AiMsg = { role: "user" | "assistant"; content: string };
  const aiStorageKey = `cowork-ai-${id}`;
  const [aiMessages, setAiMessages] = useState<AiMsg[]>(() => {
    if (typeof window === "undefined") return [];
    try { const raw = localStorage.getItem(aiStorageKey); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [aiInput, setAiInput] = useState("");
  useEffect(() => { try { localStorage.setItem(aiStorageKey, JSON.stringify(aiMessages.slice(-60))); } catch {} }, [aiMessages, aiStorageKey]);
  const [aiLoading, setAiLoading] = useState(false);
  const aiScrollRef = useRef<HTMLDivElement>(null);

  // Memo
  const [memo, setMemo] = useState("");
  const [memoSaving, setMemoSaving] = useState(false);

  // Title edit
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState("");

  const isMember = members.some(m => m.employee_id === currentUserId);
  const isOwner = members.some(m => m.employee_id === currentUserId && m.role === "owner");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, mRes, tRes, sRes, dRes, rRes, aRes, pRes] = await Promise.all([
        fetch(`/api/cowork/${id}`),
        fetch(`/api/cowork/${id}/members`),
        fetch(`/api/cowork/${id}/tasks`),
        fetch(`/api/cowork/${id}/schedules`),
        fetch(`/api/cowork/${id}/documents`),
        fetch(`/api/cowork/${id}/requests`),
        fetch(`/api/cowork/${id}/activities`),
        fetch(`/api/cowork/${id}/posts`),
      ]);
      const [cw, mb, tk, sc, dc, rq, ac, ps] = await Promise.all([
        cRes.json(), mRes.json(), tRes.json(), sRes.json(), dRes.json(), rRes.json(), aRes.json(), pRes.json(),
      ]);
      setCowork(cw);
      setMembers(Array.isArray(mb) ? mb : []);
      setTasks(Array.isArray(tk) ? tk : []);
      setSchedules(Array.isArray(sc) ? sc : []);
      setDocuments(Array.isArray(dc) ? dc : []);
      setRequests(Array.isArray(rq) ? rq : []);
      setActivities(Array.isArray(ac) ? ac : []);
      setPosts(Array.isArray(ps) ? ps : []);
      setMemo(cw?.memo ?? "");
      setTitleVal(cw?.title ?? "");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    fetch("/api/employees").then(r => r.ok ? r.json() : []).then(d => setEmployees(Array.isArray(d) ? d : []));
    fetch("/api/leave-events").then(r => r.ok ? r.json() : []).then(d => setLeaveEvents(Array.isArray(d) ? d : []));
  }, []);

  // Fetch comments for task modal
  useEffect(() => {
    if (!taskModal) return;
    fetch(`/api/cowork/${id}/comments?task_id=${taskModal.id}`)
      .then(r => r.ok ? r.json() : []).then(d => setComments(Array.isArray(d) ? d : []));
  }, [taskModal, id]);

  const fetchPostComments = async (postId: string) => {
    const res = await fetch(`/api/cowork/${id}/comments?post_id=${postId}`);
    if (res.ok) { const data = await res.json(); setPostComments(Array.isArray(data) ? data : []); }
  };

  const moveTask = async (task: Task, dir: "prev" | "next") => {
    const cols = ["todo", "in_progress", "done"];
    const idx = cols.indexOf(task.status);
    const newStatus = dir === "next" ? cols[idx + 1] : cols[idx - 1];
    if (!newStatus) return;
    const res = await fetch(`/api/cowork/${id}/tasks/${task.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus as Task["status"] } : t));
    else alert("이동 실패");
  };

  const addTask = async (status: string) => {
    if (!newTaskTitle.trim()) return;
    const res = await fetch(`/api/cowork/${id}/tasks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTaskTitle.trim(), status }),
    });
    if (res.ok) {
      const t = await res.json();
      setTasks(prev => [...prev, t]);
      setNewTaskTitle(""); setAddingTaskCol(null);
    }
  };

  const saveMemo = async () => {
    setMemoSaving(true);
    await fetch(`/api/cowork/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memo }),
    });
    setMemoSaving(false);
  };

  const saveTitle = async () => {
    if (!titleVal.trim()) return;
    await fetch(`/api/cowork/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: titleVal.trim() }),
    });
    setCowork(prev => prev ? { ...prev, title: titleVal.trim() } : prev);
    setEditingTitle(false);
  };

  const deleteCowork = async () => {
    if (!confirm("코워크를 삭제하시겠습니까? 모든 데이터가 삭제됩니다.")) return;
    await fetch(`/api/cowork/${id}`, { method: "DELETE" });
    router.push("/cowork");
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400 text-sm">불러오는 중...</div>
  );
  if (!cowork) return (
    <div className="flex items-center justify-center h-64 text-slate-400 text-sm">코워크를 찾을 수 없습니다.</div>
  );

  const tasksByStatus = (status: string) =>
    tasks.filter(t => t.status === status).sort((a, b) => a.order_index - b.order_index);
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="min-h-full">
      {/* ── Header ── */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <button onClick={() => router.push("/cowork")} className="mt-1 p-1 rounded-md hover:bg-slate-100 text-slate-500">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            {editingTitle && isMember ? (
              <div className="flex items-center gap-2">
                <Input value={titleVal} onChange={e => setTitleVal(e.target.value)} className="text-xl font-bold h-9" onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }} autoFocus />
                <button onClick={saveTitle} className="text-blue-600 hover:text-blue-700"><Check className="h-5 w-5" /></button>
                <button onClick={() => setEditingTitle(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h1 className="text-xl font-bold text-slate-900 truncate">{cowork.title}</h1>
                {isMember && <button onClick={() => setEditingTitle(true)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600"><Pencil className="h-4 w-4" /></button>}
              </div>
            )}
            <div className="mt-1 flex items-center gap-3">
              <div className="flex items-center gap-1">
                {members.slice(0, 5).map(m => <Avatar key={m.id} name={m.employee_name} />)}
                {members.length > 5 && <span className="text-xs text-slate-500">+{members.length - 5}</span>}
              </div>
              {isMember && (
                <button onClick={() => setAddMemberOpen(true)} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                  <Plus className="h-3 w-3" />멤버추가
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setActivityOpen(true)} className="p-2 rounded-md hover:bg-slate-100 text-slate-500 relative">
            <Bell className="h-5 w-5" />
            {activities.length > 0 && <span className="absolute top-1 right-1 h-2 w-2 bg-blue-500 rounded-full" />}
          </button>
          {isOwner && <button onClick={deleteCowork} className="p-2 rounded-md hover:bg-red-50 text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="mb-6 border-b border-slate-200 flex gap-1">
        {(["overview","kanban","calendar","board","docs","requests","ai"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t ? "border-blue-500 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
            )}>
            {{ overview:"개요", kanban:"칸반", calendar:"캘린더", board:"게시판", docs:"문서", requests:"업무요청", ai:"AI 어시스턴트" }[t]}
          </button>
        ))}
      </div>

      {/* ── Tab: 개요 ── */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* 설명 */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">설명</h2>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{cowork.description || <span className="text-slate-400">설명이 없습니다.</span>}</p>
            </div>

            {/* 진행률 */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">진행 현황</h2>
              <div className="flex items-center gap-4 mb-3">
                <div className="flex-1 bg-slate-100 rounded-full h-3">
                  <div className="bg-blue-500 h-3 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-sm font-bold text-slate-700 w-10 text-right">{progress}%</span>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-slate-500">할일 <strong className="text-slate-800">{tasks.filter(t=>t.status==="todo").length}</strong></span>
                <span className="text-slate-500">진행중 <strong className="text-blue-600">{tasks.filter(t=>t.status==="in_progress").length}</strong></span>
                <span className="text-slate-500">완료 <strong className="text-emerald-600">{tasks.filter(t=>t.status==="done").length}</strong></span>
              </div>
            </div>

            {/* 빠른 메모 */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">공유 메모</h2>
              <textarea
                value={memo}
                onChange={e => setMemo(e.target.value)}
                onBlur={saveMemo}
                disabled={!isMember}
                placeholder={isMember ? "멤버 전원이 편집할 수 있는 메모..." : "메모가 없습니다."}
                rows={5}
                className="w-full text-sm text-slate-700 resize-none border-0 outline-none bg-slate-50 rounded-lg p-3 placeholder-slate-300 disabled:bg-transparent disabled:cursor-default"
              />
              {memoSaving && <p className="text-xs text-slate-400 mt-1">저장 중...</p>}
            </div>
          </div>

          <div className="space-y-6">
            {/* 멤버 */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">멤버 ({members.length})</h2>
              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar name={m.employee_name} />
                      <span className="text-sm text-slate-700">{m.employee_name}</span>
                    </div>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full", m.role === "owner" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600")}>
                      {m.role === "owner" ? "오너" : "멤버"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 최근 활동 */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-700">최근 활동</h2>
                <button onClick={() => setActivityOpen(true)} className="text-xs text-blue-500 hover:underline">전체보기</button>
              </div>
              <div className="space-y-3">
                {activities.slice(0, 5).map(a => (
                  <div key={a.id} className="text-xs">
                    <span className="font-medium text-slate-700">{a.actor_name}</span>
                    <span className="text-slate-500">이(가) </span>
                    {a.target_title && <span className="font-medium text-slate-700">[{a.target_title}]</span>}
                    <span className="text-slate-500"> {ACTION_LABEL[a.action] ?? a.action}</span>
                    <div className="text-slate-400 mt-0.5">{format(parseISO(a.created_at), "MM.dd HH:mm", { locale: ko })}</div>
                  </div>
                ))}
                {activities.length === 0 && <p className="text-xs text-slate-400">활동 내역이 없습니다.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: 칸반 ── */}
      {tab === "kanban" && (
        <div className="grid grid-cols-3 gap-4 items-start">
          {(["todo","in_progress","done"] as const).map(col => (
            <div key={col} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className={cn("text-sm font-semibold", col==="todo"?"text-slate-600":col==="in_progress"?"text-blue-600":"text-emerald-600")}>
                  {STATUS_LABEL[col]} <span className="font-normal text-slate-400">({tasksByStatus(col).length})</span>
                </h3>
              </div>
              <div className="space-y-2 min-h-[40px]">
                {tasksByStatus(col).map(task => {
                  const isBlocked = (task.depends_on ?? []).some(depId => {
                    const dep = tasks.find(t => t.id === depId);
                    return dep && dep.status !== "done";
                  });
                  const commentCount = comments.filter(c => c.task_id === task.id).length;
                  return (
                    <div key={task.id} className={cn("bg-white rounded-lg border p-3 cursor-pointer hover:shadow-sm transition-shadow", isBlocked && "opacity-60")}
                      onClick={() => setTaskModal(task)}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-800 leading-snug">{task.title}</p>
                        {isBlocked && <span title="의존 태스크 미완료"><AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" /></span>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className={cn("text-xs", task.priority==="high"?"text-red-500":task.priority==="low"?"text-blue-400":"text-slate-400")}>{PRIORITY_LABEL[task.priority]}</span>
                        {task.assignee_name && <span className="text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{task.assignee_name}</span>}
                        {task.due_date && <span className={cn("text-xs", getDueDateStyle(task.due_date))}>{task.due_date}</span>}
                      </div>
                      {isMember && (
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-1 text-slate-400">
                            <MessageCircle className="h-3 w-3" /><span className="text-xs">{commentCount}</span>
                          </div>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            {col !== "todo" && <button onClick={() => moveTask(task,"prev")} className="p-0.5 rounded hover:bg-slate-100"><ChevronLeft className="h-3.5 w-3.5 text-slate-400" /></button>}
                            {col !== "done" && <button onClick={() => moveTask(task,"next")} className="p-0.5 rounded hover:bg-slate-100"><ChevronRight className="h-3.5 w-3.5 text-slate-400" /></button>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {isMember && (
                <div className="mt-2">
                  {addingTaskCol === col ? (
                    <div className="space-y-1">
                      <Input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                        placeholder="태스크 제목..." className="h-8 text-sm"
                        onKeyDown={e => { if (e.key === "Enter") addTask(col); if (e.key === "Escape") { setAddingTaskCol(null); setNewTaskTitle(""); } }}
                        autoFocus />
                      <div className="flex gap-1">
                        <Button size="sm" className="h-7 text-xs flex-1" onClick={() => addTask(col)}>추가</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAddingTaskCol(null); setNewTaskTitle(""); }}>취소</Button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAddingTaskCol(col)} className="w-full text-xs text-slate-400 hover:text-slate-600 py-1.5 border border-dashed border-slate-200 rounded-lg hover:border-slate-300 flex items-center justify-center gap-1">
                      <Plus className="h-3 w-3" />태스크 추가
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: 캘린더 ── */}
      {tab === "calendar" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setCalMonth(m => subMonths(m,1))} className="p-1.5 rounded-md hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-base font-semibold text-slate-800">{format(calMonth,"yyyy년 M월",{locale:ko})}</span>
              <button onClick={() => setCalMonth(m => addMonths(m,1))} className="p-1.5 rounded-md hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onMouseDown={() => setShowLeave(true)} onMouseUp={() => setShowLeave(false)}
                onMouseLeave={() => setShowLeave(false)} onTouchStart={() => setShowLeave(true)} onTouchEnd={() => setShowLeave(false)}
                className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all select-none",
                  showLeave ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}>
                <Eye className="h-4 w-4" /> 연차보기
              </button>
              {isMember && <Button size="sm" onClick={() => setAddScheduleOpen(true)}><Plus className="h-4 w-4 mr-1"/>일정추가</Button>}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-200">
              {["일","월","화","수","목","금","토"].map(d => (
                <div key={d} className="py-2 text-center text-xs font-medium text-slate-500">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {getCalendarDays(calMonth.getFullYear(), calMonth.getMonth()).map((day, i) => {
                const isCurrentMonth = isSameMonth(day, calMonth);
                const isToday = isSameDay(day, new Date());
                const dayStr = format(day, "yyyy-MM-dd");
                const daySchedules = schedules.filter(s => s.start_date <= dayStr && (s.end_date ?? s.start_date) >= dayStr);
                const dayTasksDue = tasks.filter(t => t.due_date === dayStr);
                return (
                  <div key={i} className={cn("min-h-[80px] p-1.5 border-b border-r border-slate-100", !isCurrentMonth && "bg-slate-50")}>
                    <div className={cn("text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1", isToday ? "bg-blue-500 text-white" : isCurrentMonth ? "text-slate-700" : "text-slate-300")}>
                      {day.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {daySchedules.map(s => (
                        <div key={s.id} onClick={() => isMember && setEditSchedule(s)}
                          className="text-[10px] text-white rounded px-1 py-0.5 truncate cursor-pointer hover:opacity-80"
                          style={{ backgroundColor: s.color }}>
                          {s.title}
                        </div>
                      ))}
                      {dayTasksDue.map(t => (
                        <div key={t.id} className="text-[10px] text-slate-500 flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />{t.title}
                        </div>
                      ))}
                      {showLeave && isCurrentMonth && (() => {
                        const lvs = leaveEvents.filter(e => {
                          const d = new Date(dayStr);
                          return d >= new Date(e.startDate) && d <= new Date(e.endDate);
                        });
                        if (!lvs.length) return null;
                        return lvs.map(lv => (
                          <div key={lv.id} className="truncate rounded px-1 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border-l-2 border-emerald-500">
                            {lv.userName} {lv.leaveType === "annual" ? "연차" : lv.leaveType === "half_am" ? "오전반차" : lv.leaveType === "half_pm" ? "오후반차" : "휴가"}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: 게시판 ── */}
      {tab === "board" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">게시판 ({posts.length})</h2>
            {isMember && <Button size="sm" onClick={() => { setSelectedPost(null); setNewPostOpen(true); }}><Plus className="h-4 w-4 mr-1" />글쓰기</Button>}
          </div>
          {posts.length === 0
            ? <div className="text-center py-16 text-slate-400 text-sm">게시글이 없습니다.</div>
            : <div className="space-y-2">
                {posts.map(post => (
                  <div key={post.id} onClick={() => { setSelectedPost(post); setNewPostOpen(false); fetchPostComments(post.id); }}
                    className="rounded-xl border border-slate-200 bg-white p-4 cursor-pointer hover:border-blue-200 hover:shadow-sm transition-all group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {post.pinned && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">고정</span>}
                          <h3 className="text-sm font-semibold text-slate-800 truncate">{post.title}</h3>
                        </div>
                        {post.content && <p className="text-xs text-slate-500 mt-1 line-clamp-2 whitespace-pre-wrap">{post.content}</p>}
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-400 shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                      <span>{post.author_name}</span>
                      <span>{format(parseISO(post.created_at), "MM.dd HH:mm", { locale: ko })}</span>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* ── Post Detail Modal ── */}
      {selectedPost && !newPostOpen && (
        <Dialog open onOpenChange={() => setSelectedPost(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-2">
                {selectedPost.pinned && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">고정</span>}
                <DialogTitle className="text-base">{selectedPost.title}</DialogTitle>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                <span>{selectedPost.author_name}</span>
                <span>{format(parseISO(selectedPost.created_at), "yyyy.MM.dd HH:mm", { locale: ko })}</span>
              </div>
            </DialogHeader>
            {selectedPost.content && (
              <div className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-4 mt-2">{selectedPost.content}</div>
            )}

            {/* 댓글 */}
            <div className="mt-4 border-t pt-3">
              <p className="text-xs font-semibold text-slate-500 mb-2">댓글 ({postComments.filter(c => c.post_id === selectedPost.id).length})</p>
              <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                {postComments.filter(c => c.post_id === selectedPost.id).map(c => (
                  <div key={c.id} className="bg-slate-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-slate-700">{c.author_name}</span>
                      <span className="text-[10px] text-slate-400">{format(parseISO(c.created_at), "MM.dd HH:mm", { locale: ko })}</span>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.content}</p>
                  </div>
                ))}
              </div>
              {isMember && <PostCommentInput coworkId={id} postId={selectedPost.id} onAdded={(c) => setPostComments(prev => [...prev, c])} />}
            </div>

            <DialogFooter className="gap-2 mt-2">
              {isMember && (
                <>
                  <Button variant="outline" size="sm" onClick={async () => {
                    await fetch(`/api/cowork/${id}/posts/${selectedPost.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: !selectedPost.pinned }) });
                    setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, pinned: !p.pinned } : p));
                    setSelectedPost({ ...selectedPost, pinned: !selectedPost.pinned });
                  }}>{selectedPost.pinned ? "고정 해제" : "📌 고정"}</Button>
                  <Button variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50" onClick={async () => {
                    if (!confirm("게시글을 삭제하시겠습니까?")) return;
                    await fetch(`/api/cowork/${id}/posts/${selectedPost.id}`, { method: "DELETE" });
                    setPosts(prev => prev.filter(p => p.id !== selectedPost.id));
                    setSelectedPost(null);
                  }}>삭제</Button>
                </>
              )}
              <Button variant="outline" onClick={() => setSelectedPost(null)}>닫기</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── New Post Modal ── */}
      {newPostOpen && (
        <NewPostModal coworkId={id} onClose={() => setNewPostOpen(false)} onCreated={(p) => { setPosts(prev => [p, ...prev]); setNewPostOpen(false); }} />
      )}

      {/* ── Tab: 문서 ── */}
      {tab === "docs" && (
        <div className="space-y-6">
          {/* 링크 */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700">링크</h2>
              {isMember && <Button size="sm" variant="outline" onClick={() => setAddLinkOpen(true)}><Plus className="h-4 w-4 mr-1"/>링크추가</Button>}
            </div>
            {documents.filter(d=>d.type==="link").length === 0
              ? <p className="text-sm text-slate-400">등록된 링크가 없습니다.</p>
              : <div className="space-y-2">
                  {documents.filter(d=>d.type==="link").map(doc => (
                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 group">
                      <a href={doc.link_url ?? ""} target="_blank" rel="noreferrer" className="flex items-center gap-2 min-w-0 flex-1">
                        <LinkIcon className="h-4 w-4 text-blue-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{doc.link_title || doc.link_url}</p>
                          <p className="text-xs text-slate-400 truncate">{doc.link_url}</p>
                        </div>
                      </a>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className="text-xs text-slate-400">{doc.uploader_name}</span>
                        {isMember && <button onClick={async () => {
                          await fetch(`/api/cowork/${id}/documents?doc_id=${doc.id}`, { method: "DELETE" });
                          setDocuments(prev => prev.filter(d => d.id !== doc.id));
                        }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
          {/* 파일 */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700">파일</h2>
              {isMember && (
                <label className="cursor-pointer">
                  <input type="file" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    // 1. 서버에서 signed token + DB 레코드 생성
                    const res = await fetch(`/api/cowork/${id}/documents/upload`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ file_name: file.name }),
                    });
                    if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.error || "업로드 준비 실패"); e.target.value = ""; return; }
                    const doc = await res.json();
                    // 2. Supabase Storage uploadToSignedUrl
                    const { createClient: createBrowserClient } = await import("@/utils/supabase/client");
                    const sb = createBrowserClient();
                    const { error: upErr } = await sb.storage.from("documents").uploadToSignedUrl(doc.storage_path, doc.token, file, {
                      contentType: file.type || "application/octet-stream",
                    });
                    if (!upErr) { setDocuments(prev => [doc, ...prev]); }
                    else { alert("파일 업로드 실패: " + upErr.message); }
                    e.target.value = "";
                  }} />
                  <span className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700">
                    <Upload className="h-4 w-4" />파일 업로드
                  </span>
                </label>
              )}
            </div>
            {documents.filter(d => d.type === "file").length === 0
              ? <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center">
                  <Upload className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">파일을 업로드하세요</p>
                </div>
              : <div className="space-y-2">
                  {documents.filter(d => d.type === "file").map(doc => (
                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 group">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileText className="h-4 w-4 text-slate-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{doc.file_name}</p>
                          <p className="text-xs text-slate-400">{doc.uploader_name} · {format(parseISO(doc.created_at), "MM.dd", { locale: ko })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <a href={doc.file_url ?? ""} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-600">
                          <Download className="h-4 w-4" />
                        </a>
                        {isMember && <button onClick={async () => {
                          await fetch(`/api/cowork/${id}/documents?doc_id=${doc.id}`, { method: "DELETE" });
                          setDocuments(prev => prev.filter(d => d.id !== doc.id));
                        }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
      )}

      {/* ── Tab: 업무요청 ── */}
      {tab === "requests" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1">
              {(["received","sent"] as const).map(t => (
                <button key={t} onClick={() => setRequestTab(t)}
                  className={cn("px-4 py-2 text-sm font-medium rounded-lg", requestTab===t?"bg-blue-500 text-white":"text-slate-500 hover:bg-slate-100")}>
                  {t==="received"?"받은 요청":"보낸 요청"}
                </button>
              ))}
            </div>
            {isMember && <Button size="sm" onClick={() => setAddRequestOpen(true)}><Plus className="h-4 w-4 mr-1"/>업무요청</Button>}
          </div>
          <div className="space-y-3">
            {requests.filter(r => requestTab === "received" ? r.to_id === currentUserId : r.from_id === currentUserId).map(req => (
              <div key={req.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-slate-800">{req.title}</p>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                        req.status==="pending"?"bg-amber-100 text-amber-700":
                        req.status==="accepted"?"bg-blue-100 text-blue-700":
                        req.status==="rejected"?"bg-red-100 text-red-600":
                        "bg-emerald-100 text-emerald-700")}>
                        {req.status==="pending"?"대기중":req.status==="accepted"?"수락됨":req.status==="rejected"?"거절됨":"완료"}
                      </span>
                    </div>
                    {req.content && <p className="text-sm text-slate-500 mb-2">{req.content}</p>}
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>{requestTab==="received"?`요청자: ${req.from_name}`:`수신자: ${req.to_name}`}</span>
                      {req.due_date && <span className={getDueDateStyle(req.due_date)}>마감: {req.due_date}</span>}
                    </div>
                  </div>
                  {requestTab === "received" && req.to_id === currentUserId && (
                    <div className="flex gap-2 shrink-0">
                      {req.status === "pending" && <>
                        <Button size="sm" variant="outline" className="h-7 text-xs text-red-500 border-red-200 hover:bg-red-50" onClick={async () => {
                          await fetch(`/api/cowork/${id}/requests/${req.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({status:"rejected"}) });
                          setRequests(prev => prev.map(r => r.id===req.id ? {...r,status:"rejected"} : r));
                        }}>거절</Button>
                        <Button size="sm" className="h-7 text-xs" onClick={async () => {
                          await fetch(`/api/cowork/${id}/requests/${req.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({status:"accepted"}) });
                          setRequests(prev => prev.map(r => r.id===req.id ? {...r,status:"accepted"} : r));
                        }}>수락</Button>
                      </>}
                      {req.status === "accepted" && (
                        <Button size="sm" className="h-7 text-xs bg-emerald-500 hover:bg-emerald-600" onClick={async () => {
                          await fetch(`/api/cowork/${id}/requests/${req.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({status:"done"}) });
                          setRequests(prev => prev.map(r => r.id===req.id ? {...r,status:"done"} : r));
                        }}>완료</Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {requests.filter(r => requestTab==="received" ? r.to_id===currentUserId : r.from_id===currentUserId).length === 0 && (
              <div className="text-center py-12 text-slate-400 text-sm">요청이 없습니다.</div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: AI 어시스턴트 ── */}
      {tab === "ai" && (
        <div className="rounded-xl border border-slate-200 bg-white flex flex-col" style={{ height: "calc(100vh - 280px)" }}>
          <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">AI</div>
            <div>
              <p className="text-sm font-semibold text-slate-800">코워크 AI 어시스턴트</p>
              <p className="text-[10px] text-slate-400">프로젝트 맥락을 이해하고 도와줍니다</p>
            </div>
          </div>
          <div ref={aiScrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
            {aiMessages.length === 0 && (
              <div className="text-center py-12">
                <div className="h-14 w-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🤖</span>
                </div>
                <p className="text-sm font-semibold text-slate-700 mb-1">AI와 함께 코워크하세요</p>
                <p className="text-xs text-slate-400 mb-6">프로젝트 현황, 태스크 분석, 아이디어 정리 등</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    "현재 진행 상황 요약해줘",
                    "마감 임박 태스크 알려줘",
                    "이 프로젝트에서 우선순위 정리해줘",
                    "회의 안건 정리해줘",
                  ].map(s => (
                    <button key={s} onClick={() => { setAiInput(s); }} className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {aiMessages.map((msg, i) => (
              <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                  msg.role === "user" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-800"
                )}>
                  {msg.content}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-xl px-4 py-2.5 text-sm text-slate-500">
                  <span className="animate-pulse">생각하는 중...</span>
                </div>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-slate-200">
            <form onSubmit={async (e) => {
              e.preventDefault();
              const text = aiInput.trim();
              if (!text || aiLoading) return;
              setAiInput("");
              const userMsg: AiMsg = { role: "user", content: text };
              const next = [...aiMessages, userMsg];
              setAiMessages(next);
              setAiLoading(true);
              setTimeout(() => aiScrollRef.current?.scrollTo({ top: aiScrollRef.current.scrollHeight, behavior: "smooth" }), 50);
              try {
                const docList = documents.map(d => d.type === "file" ? `[파일] ${d.file_name} (${d.file_url})` : `[링크] ${d.link_title ?? d.link_url} (${d.link_url})`).join("\n");
                const coworkContext = `[코워크 프로젝트 컨텍스트]
프로젝트명: ${cowork?.title ?? ""}
설명: ${cowork?.description ?? ""}
멤버: ${members.map(m => m.employee_name).join(", ")}
태스크 현황: 할일 ${tasks.filter(t=>t.status==="todo").length}개, 진행중 ${tasks.filter(t=>t.status==="in_progress").length}개, 완료 ${tasks.filter(t=>t.status==="done").length}개
태스크 목록: ${tasks.map(t => `[${STATUS_LABEL[t.status]}] ${t.title}${t.assignee_name ? ` (${t.assignee_name})` : ""}${t.due_date ? ` 마감:${t.due_date}` : ""}`).join(" / ")}
업무요청: ${requests.filter(r=>r.status==="pending").length}개 대기중
문서: ${docList || "없음"}
메모: ${memo}`;
                const res = await fetch("/api/chat", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    messages: next.map(m => ({
                      role: m.role,
                      content: m.role === "user" && m === userMsg ? `${coworkContext}\n\n사용자 질문: ${m.content}` : m.content,
                    })),
                    user: { userId: currentUserId, name: currentUserName, role: "코워크" },
                  }),
                });
                const data = await res.json() as { reply?: string };
                setAiMessages([...next, { role: "assistant", content: data.reply ?? "응답을 받지 못했습니다." }]);
              } catch {
                setAiMessages([...next, { role: "assistant", content: "오류가 발생했습니다." }]);
              }
              setAiLoading(false);
              setTimeout(() => aiScrollRef.current?.scrollTo({ top: aiScrollRef.current.scrollHeight, behavior: "smooth" }), 100);
            }} className="flex gap-2">
              <Input value={aiInput} onChange={e => setAiInput(e.target.value)} placeholder="AI에게 질문하세요..." className="text-sm" disabled={aiLoading} />
              <Button type="submit" size="sm" disabled={aiLoading || !aiInput.trim()}><Send className="h-4 w-4" /></Button>
            </form>
          </div>
        </div>
      )}

      {/* ── Activity Side Panel ── */}
      {activityOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => setActivityOpen(false)} />
          <div className="relative w-80 bg-white h-full shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-slate-800">활동 피드</h2>
              <button onClick={() => setActivityOpen(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activities.map(a => (
                <div key={a.id} className="flex gap-3">
                  <Avatar name={a.actor_name} size="sm" />
                  <div className="flex-1">
                    <p className="text-xs text-slate-700">
                      <span className="font-semibold">{a.actor_name}</span>
                      {a.target_title && <> <span className="font-medium">[{a.target_title}]</span></>}
                      {" "}{ACTION_LABEL[a.action] ?? a.action}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{format(parseISO(a.created_at),"MM.dd HH:mm",{locale:ko})}</p>
                  </div>
                </div>
              ))}
              {activities.length === 0 && <p className="text-sm text-slate-400 text-center pt-8">활동 내역이 없습니다.</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Task Detail Modal ── */}
      {taskModal && (
        <TaskDetailModal
          task={taskModal} tasks={tasks} members={members} comments={comments}
          coworkId={id} isMember={isMember} currentUserName={currentUserName ?? ""}
          onClose={() => setTaskModal(null)}
          onUpdate={(updated) => setTasks(prev => prev.map(t => t.id===updated.id ? updated : t))}
          onDelete={(taskId) => { setTasks(prev => prev.filter(t => t.id!==taskId)); setTaskModal(null); }}
          onCommentAdded={(c) => setComments(prev => [...prev, c])}
        />
      )}

      {/* ── Add Member Modal ── */}
      {isMember && <AddMemberModal open={addMemberOpen} onClose={() => setAddMemberOpen(false)}
        employees={employees} members={members} coworkId={id}
        onAdded={(m) => setMembers(prev => [...prev, m])}
        onRemoved={(empId) => setMembers(prev => prev.filter(m => m.employee_id !== empId))}
        currentUserId={currentUserId ?? ""}
      />}

      {/* ── Add Schedule Modal ── */}
      <AddScheduleModal open={addScheduleOpen} onClose={() => setAddScheduleOpen(false)}
        coworkId={id} members={members}
        onAdded={(s) => setSchedules(prev => [...prev, s])}
      />

      {/* ── Edit Schedule Modal ── */}
      {editSchedule && (
        <EditScheduleModal schedule={editSchedule} coworkId={id}
          onClose={() => setEditSchedule(null)}
          onUpdated={(s) => setSchedules(prev => prev.map(x => x.id===s.id ? s : x))}
          onDeleted={(sId) => { setSchedules(prev => prev.filter(x => x.id!==sId)); setEditSchedule(null); }}
        />
      )}

      {/* ── Add Link Modal ── */}
      <AddLinkModal open={addLinkOpen} onClose={() => setAddLinkOpen(false)}
        coworkId={id} onAdded={(d) => setDocuments(prev => [d, ...prev])}
      />

      {/* ── Add Request Modal ── */}
      <AddRequestModal open={addRequestOpen} onClose={() => setAddRequestOpen(false)}
        coworkId={id} members={members} currentUserId={currentUserId ?? ""} currentUserName={currentUserName ?? ""}
        onAdded={(r) => setRequests(prev => [r, ...prev])}
      />
    </div>
  );
}

// ─── Sub-modals ─────────────────────────────────────────────────────────────────

function TaskDetailModal({ task, tasks, members, comments, coworkId, isMember, currentUserName, onClose, onUpdate, onDelete, onCommentAdded }: {
  task: Task; tasks: Task[]; members: Member[]; comments: Comment[]; coworkId: string;
  isMember: boolean; currentUserName: string;
  onClose: () => void;
  onUpdate: (t: Task) => void;
  onDelete: (id: string) => void;
  onCommentAdded: (c: Comment) => void;
}) {
  const [form, setForm] = useState({ title: task.title, description: task.description ?? "", assignee_name: task.assignee_name ?? "", priority: task.priority, due_date: task.due_date ?? "", status: task.status });
  const [saving, setSaving] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [deps, setDeps] = useState<string[]>(task.depends_on ?? []);

  const save = async () => {
    setSaving(true);
    const assignee = members.find(m => m.employee_name === form.assignee_name);
    const res = await fetch(`/api/cowork/${coworkId}/tasks/${task.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, assignee_id: assignee?.employee_id, depends_on: deps }),
    });
    if (res.ok) { const updated = await res.json(); onUpdate({ ...task, ...updated, depends_on: deps }); onClose(); }
    else { const err = await res.json().catch(() => ({})); alert(err.error || "저장 실패"); }
    setSaving(false);
  };

  const sendComment = async () => {
    if (!commentText.trim()) return;
    setSending(true);
    const res = await fetch(`/api/cowork/${coworkId}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: task.id, content: commentText.trim() }),
    });
    if (res.ok) { const c = await res.json(); onCommentAdded(c); setCommentText(""); }
    setSending(false);
  };

  const otherTasks = tasks.filter(t => t.id !== task.id);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isMember ? "태스크 수정" : "태스크 상세"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">제목</Label>
            <Input value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} disabled={!isMember} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">설명</Label>
            <textarea value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} disabled={!isMember}
              rows={3} className="mt-1 w-full text-sm border rounded-md px-3 py-2 resize-none outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">담당자</Label>
              <select value={form.assignee_name} onChange={e => setForm(f=>({...f,assignee_name:e.target.value}))} disabled={!isMember}
                className="mt-1 w-full text-sm border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50">
                <option value="">미지정</option>
                {members.map(m => <option key={m.id} value={m.employee_name}>{m.employee_name}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">우선순위</Label>
              <select value={form.priority} onChange={e => setForm(f=>({...f,priority:e.target.value as Task["priority"]}))} disabled={!isMember}
                className="mt-1 w-full text-sm border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50">
                <option value="low">🔵 낮음</option>
                <option value="normal">⚪ 보통</option>
                <option value="high">🔴 높음</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">마감일</Label>
              <Input type="date" value={form.due_date} onChange={e => setForm(f=>({...f,due_date:e.target.value}))} disabled={!isMember} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">상태</Label>
              <select value={form.status} onChange={e => setForm(f=>({...f,status:e.target.value as Task["status"]}))} disabled={!isMember}
                className="mt-1 w-full text-sm border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50">
                <option value="todo">할일</option>
                <option value="in_progress">진행중</option>
                <option value="done">완료</option>
              </select>
            </div>
          </div>
          {otherTasks.length > 0 && (
            <div>
              <Label className="text-xs">의존 태스크 (완료 후 진행 가능)</Label>
              <div className="mt-1 space-y-1 max-h-28 overflow-y-auto border rounded-md p-2">
                {otherTasks.map(t => (
                  <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 px-1 py-0.5 rounded">
                    <input type="checkbox" checked={deps.includes(t.id)} onChange={e => setDeps(d => e.target.checked ? [...d,t.id] : d.filter(x=>x!==t.id))} disabled={!isMember} />
                    <span className={cn(t.status==="done"&&"line-through text-slate-400")}>{t.title}</span>
                    <span className="text-xs text-slate-400 ml-auto">{STATUS_LABEL[t.status]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 댓글 */}
          <div>
            <Label className="text-xs">댓글 ({comments.filter(c=>c.task_id===task.id).length})</Label>
            <div className="mt-1 space-y-2 max-h-40 overflow-y-auto">
              {comments.filter(c=>c.task_id===task.id).map(c => (
                <div key={c.id} className="bg-slate-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-slate-700">{c.author_name}</span>
                    <span className="text-[10px] text-slate-400">{format(parseISO(c.created_at),"MM.dd HH:mm",{locale:ko})}</span>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.content}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="댓글 입력... (@이름 으로 멘션)"
                onKeyDown={e => { if (e.key==="Enter"&&!e.shiftKey) { e.preventDefault(); sendComment(); } }} className="text-sm" />
              <Button size="sm" onClick={sendComment} disabled={sending||!commentText.trim()}><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 mt-2">
          {isMember && <Button variant="outline" className="text-red-500 border-red-200 hover:bg-red-50" size="sm" onClick={async () => {
            if (!confirm("태스크를 삭제하시겠습니까?")) return;
            await fetch(`/api/cowork/${coworkId}/tasks/${task.id}`, { method:"DELETE" });
            onDelete(task.id);
          }}>삭제</Button>}
          <Button variant="outline" onClick={onClose}>취소</Button>
          {isMember && <Button onClick={save} disabled={saving}>{saving?"저장 중...":"저장"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddMemberModal({ open, onClose, employees, members, coworkId, onAdded, onRemoved, currentUserId }: {
  open: boolean; onClose: () => void; employees: Employee[]; members: Member[];
  coworkId: string; onAdded: (m: Member) => void; onRemoved: (empId: string) => void; currentUserId: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = employees.filter(e => e.name.includes(search) && !members.some(m => m.employee_id === e.id));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>멤버 관리</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="직원 검색..." value={search} onChange={e => setSearch(e.target.value)} />
          <div className="max-h-40 overflow-y-auto space-y-1">
            {filtered.map(e => (
              <button key={e.id} onClick={async () => {
                const res = await fetch(`/api/cowork/${coworkId}/members`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({employee_id:e.id,employee_name:e.name}) });
                if (res.ok) { const m = await res.json(); onAdded(m); }
                else { const err = await res.json().catch(() => ({})); alert(err.error || `추가 실패 (${res.status})`); }
              }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 text-sm text-left">
                <Avatar name={e.name} />{e.name}
              </button>
            ))}
            {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-2">추가할 직원이 없습니다.</p>}
          </div>
          <div className="border-t pt-3">
            <p className="text-xs text-slate-500 mb-2">현재 멤버</p>
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2"><Avatar name={m.employee_name} size="sm" /><span className="text-sm">{m.employee_name}</span></div>
                {m.employee_id !== currentUserId && m.role !== "owner" && (
                  <button onClick={async () => {
                    await fetch(`/api/cowork/${coworkId}/members?employee_id=${m.employee_id}`, { method:"DELETE" });
                    onRemoved(m.employee_id);
                  }} className="text-red-400 hover:text-red-600 text-xs">제거</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddScheduleModal({ open, onClose, coworkId, members, onAdded }: {
  open: boolean; onClose: () => void; coworkId: string; members: Member[]; onAdded: (s: Schedule) => void;
}) {
  const [form, setForm] = useState({ title:"", start_date:"", end_date:"", assignee_name:"", color: COLORS[0] });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.title || !form.start_date) return;
    setSaving(true);
    const res = await fetch(`/api/cowork/${coworkId}/schedules`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    if (res.ok) { const s = await res.json(); onAdded(s); onClose(); setForm({title:"",start_date:"",end_date:"",assignee_name:"",color:COLORS[0]}); }
    setSaving(false);
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>일정 추가</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">제목 *</Label><Input className="mt-1" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">시작일 *</Label><Input type="date" className="mt-1" value={form.start_date} onChange={e=>setForm(f=>({...f,start_date:e.target.value}))} /></div>
            <div><Label className="text-xs">종료일</Label><Input type="date" className="mt-1" value={form.end_date} onChange={e=>setForm(f=>({...f,end_date:e.target.value}))} /></div>
          </div>
          <div>
            <Label className="text-xs">담당자</Label>
            <select className="mt-1 w-full text-sm border rounded-md px-3 py-2 outline-none" value={form.assignee_name} onChange={e=>setForm(f=>({...f,assignee_name:e.target.value}))}>
              <option value="">미지정</option>
              {members.map(m=><option key={m.id} value={m.employee_name}>{m.employee_name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">색상</Label>
            <div className="mt-1 flex gap-2">{COLORS.map(c=><button key={c} onClick={()=>setForm(f=>({...f,color:c}))} className={cn("w-7 h-7 rounded-full transition-all",form.color===c&&"ring-2 ring-offset-2 ring-slate-400")} style={{backgroundColor:c}} />)}</div>
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={save} disabled={saving||!form.title||!form.start_date}>{saving?"저장 중...":"저장"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditScheduleModal({ schedule, coworkId, onClose, onUpdated, onDeleted }: {
  schedule: Schedule; coworkId: string; onClose: () => void; onUpdated: (s: Schedule) => void; onDeleted: (id: string) => void;
}) {
  const [form, setForm] = useState({ title:schedule.title, start_date:schedule.start_date, end_date:schedule.end_date??"", color:schedule.color });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/cowork/${coworkId}/schedules/${schedule.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    if (res.ok) onUpdated({ ...schedule, ...form });
    setSaving(false); onClose();
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>일정 수정</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">제목</Label><Input className="mt-1" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">시작일</Label><Input type="date" className="mt-1" value={form.start_date} onChange={e=>setForm(f=>({...f,start_date:e.target.value}))} /></div>
            <div><Label className="text-xs">종료일</Label><Input type="date" className="mt-1" value={form.end_date} onChange={e=>setForm(f=>({...f,end_date:e.target.value}))} /></div>
          </div>
          <div>
            <Label className="text-xs">색상</Label>
            <div className="mt-1 flex gap-2">{COLORS.map(c=><button key={c} onClick={()=>setForm(f=>({...f,color:c}))} className={cn("w-7 h-7 rounded-full transition-all",form.color===c&&"ring-2 ring-offset-2 ring-slate-400")} style={{backgroundColor:c}} />)}</div>
          </div>
        </div>
        <DialogFooter className="mt-2 gap-2">
          <Button variant="outline" className="text-red-500 border-red-200 hover:bg-red-50" size="sm" onClick={async () => {
            if (!confirm("일정을 삭제하시겠습니까?")) return;
            await fetch(`/api/cowork/${coworkId}/schedules/${schedule.id}`, { method:"DELETE" });
            onDeleted(schedule.id);
          }}>삭제</Button>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={save} disabled={saving}>{saving?"저장 중...":"저장"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddLinkModal({ open, onClose, coworkId, onAdded }: {
  open: boolean; onClose: () => void; coworkId: string; onAdded: (d: Document) => void;
}) {
  const [form, setForm] = useState({ link_title:"", link_url:"" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.link_url) return;
    setSaving(true);
    const res = await fetch(`/api/cowork/${coworkId}/documents`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({type:"link",...form}) });
    if (res.ok) { const d = await res.json(); onAdded(d); onClose(); setForm({link_title:"",link_url:""}); }
    setSaving(false);
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>링크 추가</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">제목</Label><Input className="mt-1" placeholder="링크 이름" value={form.link_title} onChange={e=>setForm(f=>({...f,link_title:e.target.value}))} /></div>
          <div><Label className="text-xs">URL *</Label><Input className="mt-1" placeholder="https://..." value={form.link_url} onChange={e=>setForm(f=>({...f,link_url:e.target.value}))} /></div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={save} disabled={saving||!form.link_url}>{saving?"저장 중...":"저장"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddRequestModal({ open, onClose, coworkId, members, currentUserId, currentUserName, onAdded }: {
  open: boolean; onClose: () => void; coworkId: string; members: Member[];
  currentUserId: string; currentUserName: string; onAdded: (r: WorkRequest) => void;
}) {
  const [form, setForm] = useState({ to_id:"", to_name:"", title:"", content:"", due_date:"" });
  const [saving, setSaving] = useState(false);
  const otherMembers = members.filter(m => m.employee_id !== currentUserId);
  const save = async () => {
    if (!form.to_id || !form.title) return;
    setSaving(true);
    const res = await fetch(`/api/cowork/${coworkId}/requests`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    if (res.ok) { const r = await res.json(); onAdded(r); onClose(); setForm({to_id:"",to_name:"",title:"",content:"",due_date:""}); }
    setSaving(false);
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>업무요청</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">수신자 *</Label>
            <select className="mt-1 w-full text-sm border rounded-md px-3 py-2 outline-none" value={form.to_id} onChange={e => {
              const m = members.find(x=>x.employee_id===e.target.value);
              setForm(f=>({...f,to_id:e.target.value,to_name:m?.employee_name??""}));
            }}>
              <option value="">선택...</option>
              {otherMembers.map(m=><option key={m.id} value={m.employee_id}>{m.employee_name}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">제목 *</Label><Input className="mt-1" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} /></div>
          <div><Label className="text-xs">내용</Label><textarea rows={3} className="mt-1 w-full text-sm border rounded-md px-3 py-2 resize-none outline-none focus:ring-2 focus:ring-blue-500" value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))} /></div>
          <div><Label className="text-xs">마감일</Label><Input type="date" className="mt-1" value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))} /></div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={save} disabled={saving||!form.to_id||!form.title}>{saving?"전송 중...":"전송"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewPostModal({ coworkId, onClose, onCreated }: {
  coworkId: string; onClose: () => void; onCreated: (p: Post) => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/cowork/${coworkId}/posts`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), content: content.trim() || null }),
    });
    if (res.ok) { const p = await res.json(); onCreated(p); }
    else { const err = await res.json().catch(() => ({})); alert(err.error || "작성 실패"); }
    setSaving(false);
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>글쓰기</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">제목 *</Label><Input className="mt-1" value={title} onChange={e => setTitle(e.target.value)} placeholder="제목을 입력하세요" /></div>
          <div><Label className="text-xs">내용</Label><textarea rows={8} className="mt-1 w-full text-sm border rounded-md px-3 py-2 resize-none outline-none focus:ring-2 focus:ring-blue-500" value={content} onChange={e => setContent(e.target.value)} placeholder="내용을 입력하세요..." /></div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={save} disabled={saving || !title.trim()}>{saving ? "저장 중..." : "게시"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PostCommentInput({ coworkId, postId, onAdded }: {
  coworkId: string; postId: string; onAdded: (c: Comment) => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    const res = await fetch(`/api/cowork/${coworkId}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: postId, content: text.trim() }),
    });
    if (res.ok) { const c = await res.json(); onAdded(c); setText(""); }
    setSending(false);
  };
  return (
    <div className="flex gap-2">
      <Input value={text} onChange={e => setText(e.target.value)} placeholder="댓글 입력..."
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} className="text-sm" />
      <Button size="sm" onClick={send} disabled={sending || !text.trim()}><Send className="h-4 w-4" /></Button>
    </div>
  );
}
