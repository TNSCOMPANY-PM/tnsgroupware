"use client";

import { useState, useEffect, useCallback } from "react";
import { usePermission } from "@/contexts/PermissionContext";
import { useRouter } from "next/navigation";

type LogLevel = "info" | "warn" | "error";

interface ServerLog {
  id: number;
  level: LogLevel;
  message: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

interface AuditLog {
  id: number;
  action: string;
  actor_name: string | null;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

const LEVEL_STYLE: Record<LogLevel, string> = {
  info:  "bg-blue-50 text-blue-700 border-blue-200",
  warn:  "bg-amber-50 text-amber-700 border-amber-200",
  error: "bg-rose-50 text-rose-700 border-rose-200",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

export default function AdminLogsPage() {
  const { isCLevel, isMaster } = usePermission();
  const router = useRouter();
  const [tab, setTab] = useState<"server" | "audit">("server");
  const [serverLogs, setServerLogs] = useState<ServerLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [levelFilter, setLevelFilter] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isCLevel && !isMaster) router.replace("/dashboard");
  }, [isCLevel, isMaster, router]);

  const fetchServerLogs = useCallback(async () => {
    setLoading(true);
    const url = `/api/server-logs?limit=200${levelFilter ? `&level=${levelFilter}` : ""}`;
    const res = await fetch(url);
    if (res.ok) setServerLogs(await res.json());
    setLoading(false);
  }, [levelFilter]);

  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/audit-logs?limit=200");
    if (res.ok) setAuditLogs(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "server") fetchServerLogs();
    else fetchAuditLogs();
  }, [tab, fetchServerLogs, fetchAuditLogs]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">서버 로그</h1>
        <button
          onClick={() => tab === "server" ? fetchServerLogs() : fetchAuditLogs()}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          새로고침
        </button>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(["server", "audit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? "border-blue-500 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "server" ? "서버 에러/이벤트" : "감사 로그 (Audit)"}
          </button>
        ))}
      </div>

      {tab === "server" && (
        <>
          <div className="flex gap-2">
            {(["", "error", "warn", "info"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLevelFilter(l)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  levelFilter === l ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {l || "전체"}
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {loading ? (
              <p className="p-6 text-center text-sm text-slate-400">로딩 중...</p>
            ) : serverLogs.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">로그가 없습니다.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left w-24">레벨</th>
                    <th className="px-4 py-2 text-left">메시지</th>
                    <th className="px-4 py-2 text-left w-44">시각 (KST)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {serverLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${LEVEL_STYLE[log.level]}`}>
                          {log.level}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-700">
                        <div>{log.message}</div>
                        {log.detail && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-slate-400 hover:text-slate-600">상세 보기</summary>
                            <pre className="mt-1 rounded bg-slate-100 p-2 text-xs overflow-x-auto">
                              {JSON.stringify(log.detail, null, 2)}
                            </pre>
                          </details>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-400 whitespace-nowrap">{fmt(log.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === "audit" && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {loading ? (
            <p className="p-6 text-center text-sm text-slate-400">로딩 중...</p>
          ) : auditLogs.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">감사 로그가 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">액션</th>
                  <th className="px-4 py-2 text-left">처리자</th>
                  <th className="px-4 py-2 text-left">대상</th>
                  <th className="px-4 py-2 text-left w-44">시각 (KST)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs font-medium text-slate-700">{log.action}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">{log.actor_name ?? "-"}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {log.target_type && <span className="rounded bg-slate-100 px-1.5 py-0.5 mr-1">{log.target_type}</span>}
                      {log.target_id ?? ""}
                      {log.detail && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-slate-400 hover:text-slate-600">상세</summary>
                          <pre className="mt-1 rounded bg-slate-100 p-2 text-xs overflow-x-auto">
                            {JSON.stringify(log.detail, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-400 whitespace-nowrap">{fmt(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
