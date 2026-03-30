"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Loader2, Bot, ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission } from "@/contexts/PermissionContext";
import { usePathname } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "groupware-chat-history";
const MAX_STORED = 60;

const SUGGESTIONS = [
  "오늘 입금 내역 알려줘",
  "이번 주 휴가자 있어?",
  "오늘의 운세 알려줘",
  "대기 중인 결재 있어?",
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

export function AIChatWidget() {
  const { currentUserId, currentUserName, currentEmpNumber, currentEmployee, isCLevel, isTeamLead } = usePermission();
  const pathname = usePathname();
  const role = isCLevel ? "C레벨" : isTeamLead ? "팀장" : "사원";

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 마운트 후 localStorage 로드
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && currentUserId) {
      const saved = loadMessages(currentUserId);
      if (saved.length > 0) {
        setMessages(saved);
      } else {
        setMessages([{ role: "assistant", content: `안녕하세요, ${currentUserName}님! 무엇이든 물어보거나 업무를 요청하세요 😊` }]);
      }
      fetch(`/api/chat/favorites?userId=${currentUserId}`)
        .then((r) => r.json())
        .then((d: { items?: string[] }) => setFavorites(d.items ?? []))
        .catch(() => {});
    }
  }, [mounted, currentUserId, currentUserName]);

  const toggleFavorite = useCallback((text: string) => {
    if (!currentUserId) return;
    setFavorites((prev) => {
      const next = prev.includes(text) ? prev.filter((f) => f !== text) : [...prev, text];
      fetch("/api/chat/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, items: next }),
      }).catch(() => {});
      return next;
    });
  }, [currentUserId]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const updateMessages = useCallback((next: Message[]) => {
    setMessages(next);
    if (currentUserId) saveMessages(currentUserId, next);
  }, [currentUserId]);

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
  if (pathname === "/chat" || pathname === "/crm") return null;

  return (
    <>
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

      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[540px] w-[400px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center gap-2.5 bg-blue-600 px-4 py-3">
            <Bot className="size-5 text-white" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">업무 도우미</p>
              <p className="text-[11px] text-blue-200">{currentUserName} · {role}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const init: Message[] = [{ role: "assistant", content: `안녕하세요, ${currentUserName}님! 무엇이든 물어보거나 업무를 요청하세요 😊` }];
                updateMessages(init);
              }}
              className="text-[10px] text-blue-300 hover:text-white"
            >
              초기화
            </button>
          </div>

          {showFavorites && (
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-[10px] text-slate-400 mb-1.5">즐겨찾기 — 클릭하면 입력창에 붙여넣기</p>
              {favorites.length === 0 ? (
                <p className="text-xs text-slate-400">저장된 항목이 없습니다. 메시지에 ★를 눌러 저장하세요.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {favorites.map((fav) => (
                    <div key={fav} className="flex items-center gap-1">
                      <button type="button" onClick={() => { setInput(fav); setShowFavorites(false); }}
                        className="flex-1 text-left rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-blue-50 hover:border-blue-200 transition-colors truncate">
                        {fav}
                      </button>
                      <button type="button" onClick={() => toggleFavorite(fav)}
                        className="shrink-0 p-1 text-slate-300 hover:text-red-400 transition-colors">
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={cn("group flex items-end gap-1", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "user" && (
                  <button
                    type="button"
                    onClick={() => toggleFavorite(m.content)}
                    className={cn(
                      "mb-1 shrink-0 text-sm opacity-0 group-hover:opacity-100 transition-opacity",
                      favorites.includes(m.content) ? "text-yellow-400" : "text-slate-300 hover:text-yellow-400"
                    )}
                    title="즐겨찾기에 저장"
                  >
                    {favorites.includes(m.content) ? "★" : "☆"}
                  </button>
                )}
                <div className={cn(
                  "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed",
                  m.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-slate-100 text-slate-800 rounded-bl-sm"
                )}>
                  {m.content}
                </div>
              </div>
            ))}
            {(loading || ocrLoading) && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2.5">
                  <Loader2 className="size-3.5 animate-spin text-slate-400" />
                  <span className="text-xs text-slate-400">{ocrLoading ? "이미지 인식 중..." : "처리 중..."}</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {messages.length <= 1 && !loading && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)}
                  className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-100 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-slate-100 p-3 flex gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }}
            />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={ocrLoading || loading}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600 disabled:opacity-40 transition-colors"
              title="사업자등록증 이미지 업로드"
            >
              <ImagePlus className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowFavorites((v) => !v)}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl border text-base transition-colors",
                showFavorites
                  ? "border-yellow-300 bg-yellow-50 text-yellow-500"
                  : "border-slate-200 text-slate-400 hover:border-yellow-300 hover:text-yellow-400"
              )}
              title="즐겨찾기 보기"
            >
              {showFavorites ? "★" : "☆"}
            </button>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="질문하거나 업무를 요청하세요..."
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none"
            />
            <button type="button" onClick={() => send()} disabled={!input.trim() || loading}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-40">
              <Send className="size-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
