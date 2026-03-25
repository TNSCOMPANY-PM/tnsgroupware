"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Bot, ImagePlus, RotateCcw, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission } from "@/contexts/PermissionContext";
import { useSidebar } from "@/contexts/SidebarContext";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "groupware-chat-history";
const MAX_STORED = 60;

const SUGGESTIONS = [
  "오늘 입금 내역 알려줘",
  "이번 주 휴가자 있어?",
  "대기 중인 결재 있어?",
  "이번 달 매출 얼마야?",
];

function loadMessages(userId: string): Message[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as Record<string, Message[]>;
    return data[userId] ?? [];
  } catch { return []; }
}

function saveMessages(userId: string, msgs: Message[]) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data: Record<string, Message[]> = raw ? JSON.parse(raw) : {};
    data[userId] = msgs.slice(-MAX_STORED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export default function ChatPage() {
  const { currentUserId, currentUserName, currentEmpNumber, currentEmployee, isCLevel, isTeamLead } = usePermission();
  const { toggle } = useSidebar();
  const role = isCLevel ? "C레벨" : isTeamLead ? "팀장" : "사원";

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && currentUserId) {
      const saved = loadMessages(currentUserId);
      if (saved.length > 0) {
        setMessages(saved);
      } else {
        setMessages([{ role: "assistant", content: `안녕하세요, ${currentUserName}님! 무엇이든 물어보거나 업무를 요청하세요 😊` }]);
      }
    }
  }, [mounted, currentUserId, currentUserName]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const updateMessages = useCallback((next: Message[]) => {
    setMessages(next);
    if (currentUserId) saveMessages(currentUserId, next);
  }, [currentUserId]);

  const reset = useCallback(() => {
    const init: Message[] = [{ role: "assistant", content: `안녕하세요, ${currentUserName}님! 무엇이든 물어보거나 업무를 요청하세요 😊` }];
    updateMessages(init);
  }, [currentUserName, updateMessages]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    const userMsg: Message = { role: "user", content };
    const nextMessages = [...messages, userMsg];
    updateMessages(nextMessages);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          user: {
            userId: currentUserId,
            empNumber: currentEmpNumber ?? "",
            name: currentUserName,
            department: currentEmployee?.department ?? "",
            role,
          },
        }),
      });
      const data = await res.json() as { reply?: string };
      const reply = data.reply ?? "응답을 받지 못했습니다.";
      updateMessages([...nextMessages, { role: "assistant", content: reply }]);
    } catch {
      updateMessages([...nextMessages, { role: "assistant", content: "오류가 발생했습니다. 잠시 후 다시 시도해주세요." }]);
    }
    setLoading(false);
  };

  const handleImageUpload = async (file: File) => {
    if (!file) return;
    setOcrLoading(true);
    const userMsg: Message = { role: "user", content: `📎 사업자등록증 이미지를 업로드했습니다. (${file.name})` };
    const next = [...messages, userMsg];
    updateMessages(next);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ocr-bizcard", { method: "POST", body: fd });
      const data = await res.json() as Record<string, string>;
      if (data.error) throw new Error(data.error);
      const lines = [
        "📄 사업자등록증 인식 결과:",
        data.name && `• 상호: ${data.name}`,
        data.business_number && `• 사업자번호: ${data.business_number}`,
        data.representative && `• 대표자: ${data.representative}`,
        data.address && `• 주소: ${data.address}`,
        data.business_type && `• 업태: ${data.business_type}`,
        data.business_item && `• 종목: ${data.business_item}`,
      ].filter(Boolean).join("\n");
      updateMessages([...next, { role: "assistant", content: lines }]);
    } catch {
      updateMessages([...next, { role: "assistant", content: "이미지 인식에 실패했습니다. 선명한 이미지로 다시 시도해보세요." }]);
    }
    setOcrLoading(false);
  };

  if (!mounted) return null;

  return (
    // 모바일: inset-0 전체화면 / 데스크톱: 사이드바·헤더 아래 영역만 채움
    <div className="fixed inset-0 z-[35] flex flex-col bg-[#b2c7d9] md:left-64 md:top-16">
      {/* 헤더 */}
      <div className="flex items-center gap-2 bg-[#4a6fa5] px-3 py-3">
        {/* 햄버거 (모바일만) */}
        <button
          type="button"
          onClick={toggle}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white transition-colors md:hidden"
          aria-label="메뉴 열기"
        >
          <Menu className="size-5" />
        </button>

        <div className="flex size-8 items-center justify-center rounded-full bg-white/20">
          <Bot className="size-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">업무 도우미</p>
          <p className="text-[11px] text-blue-200">{currentUserName} · {role}</p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="flex size-8 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          title="대화 초기화"
        >
          <RotateCcw className="size-4" />
        </button>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex items-end gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
            {m.role === "assistant" && (
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm mb-0.5">
                <Bot className="size-4 text-[#4a6fa5]" />
              </div>
            )}
            <div className={cn(
              "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed shadow-sm",
              m.role === "user"
                ? "bg-[#fee500] text-slate-900 rounded-br-sm"
                : "bg-white text-slate-800 rounded-bl-sm"
            )}>
              {m.content}
            </div>
          </div>
        ))}

        {(loading || ocrLoading) && (
          <div className="flex items-end gap-2 justify-start">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm mb-0.5">
              <Bot className="size-4 text-[#4a6fa5]" />
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-white px-3.5 py-2.5 shadow-sm">
              <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-slate-400" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 추천 질문 */}
      {messages.length <= 1 && !loading && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => send(s)}
              className="rounded-full border border-white/60 bg-white/80 px-3 py-1.5 text-xs text-slate-700 hover:bg-white transition-colors shadow-sm">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* 입력창 */}
      <div className="bg-[#9eafc0] px-3 py-2 flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={ocrLoading || loading}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/30 text-white hover:bg-white/50 disabled:opacity-40 transition-colors"
          title="사업자등록증 이미지 업로드"
        >
          <ImagePlus className="size-4" />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="메시지를 입력하세요..."
          className="flex-1 rounded-full border-0 bg-white px-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
        />
        <button type="button" onClick={() => send()} disabled={!input.trim() || loading}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#fee500] text-slate-900 transition-colors hover:bg-yellow-400 disabled:opacity-40">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </div>
    </div>
  );
}
