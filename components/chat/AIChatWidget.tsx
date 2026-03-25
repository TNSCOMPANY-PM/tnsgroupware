"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission } from "@/contexts/PermissionContext";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "오늘 입금 내역 알려줘",
  "이번 주 휴가자 있어?",
  "대기 중인 결재 있어?",
];

export function AIChatWidget() {
  const { currentUserId, currentUserName, currentEmpNumber, currentEmployee, isCLevel, isTeamLead } = usePermission();
  const role = isCLevel ? "C레벨" : isTeamLead ? "팀장" : "사원";

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      if (messages.length === 0) {
        setMessages([{
          role: "assistant",
          content: `안녕하세요, ${currentUserName}님! 무엇이든 물어보세요 😊`,
        }]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    const userMsg: Message = { role: "user", content };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
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
      setMessages((p) => [...p, { role: "assistant", content: data.reply ?? "응답을 받지 못했습니다." }]);
    } catch {
      setMessages((p) => [...p, { role: "assistant", content: "오류가 발생했습니다. 잠시 후 다시 시도해주세요." }]);
    }
    setLoading(false);
  };

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full shadow-lg transition-all duration-300",
          open ? "bg-slate-700 hover:bg-slate-800" : "bg-blue-600 hover:bg-blue-700"
        )}
      >
        {open ? <X className="size-5 text-white" /> : <MessageCircle className="size-6 text-white" />}
      </button>

      {/* 채팅창 */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[540px] w-[370px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* 헤더 */}
          <div className="flex items-center gap-2.5 bg-blue-600 px-4 py-3">
            <Bot className="size-5 text-white" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">업무 도우미</p>
              <p className="text-[11px] text-blue-200">{currentUserName} · {role}</p>
            </div>
            <button type="button" onClick={() => setMessages([])} className="text-[10px] text-blue-300 hover:text-white">
              대화 초기화
            </button>
          </div>

          {/* 메시지 목록 */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed",
                    m.role === "user"
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-slate-100 text-slate-800 rounded-bl-sm"
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2.5">
                  <Loader2 className="size-3.5 animate-spin text-slate-400" />
                  <span className="text-xs text-slate-400">처리 중...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* 추천 질문 (메시지 없을 때) */}
          {messages.length <= 1 && !loading && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* 입력창 */}
          <div className="border-t border-slate-100 p-3 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="질문하거나 업무를 요청하세요..."
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
