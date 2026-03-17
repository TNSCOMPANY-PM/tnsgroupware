"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type TableName = "employees" | "leaves" | "projects";

type PayloadRecord = Record<string, unknown> & { id?: string };

export type UseSupabaseRealtimeOptions<T> = {
  /** 실시간 변경 시 호출 (Toast 등) */
  onRealtime?: () => void;
  /** 초기 fetch 실패 시 빈 배열 대신 사용할 값 */
  initialData?: T[];
};

/**
 * Supabase Realtime 구독 + 로컬 상태 동기화.
 * INSERT → 리스트 맨 앞 추가, UPDATE → id 기준 교체, DELETE → id 기준 제거.
 * 언마운트 시 removeChannel 호출.
 */
export function useSupabaseRealtime<T extends { id?: string }>(
  table: TableName,
  options: UseSupabaseRealtimeOptions<T> = {}
) {
  const { onRealtime, initialData = [] } = options;
  const onRealtimeRef = useRef(onRealtime);
  onRealtimeRef.current = onRealtime;
  const initialDataRef = useRef(initialData);
  initialDataRef.current = initialData;

  const [data, setData] = useState<T[]>(initialData);
  const [loading, setLoading] = useState(true);
  const fetchIdRef = useRef(0);
  const hasDataRef = useRef(false);

  const fetchInitial = useCallback(async () => {
    const fallback = initialDataRef.current;
    const id = ++fetchIdRef.current;

    if (table === "employees") {
      if (!hasDataRef.current) setLoading(true);
      try {
        const res = await fetch("/api/employees");
        if (id !== fetchIdRef.current) return;
        if (!res.ok) {
          setData(fallback);
          setLoading(false);
          return;
        }
        const rows = (await res.json()) as T[];
        setData(Array.isArray(rows) ? rows : []);
        hasDataRef.current = true;
      } catch {
        if (id === fetchIdRef.current) setData(fallback);
      } finally {
        if (id === fetchIdRef.current) setLoading(false);
      }
      return;
    }

    const supabase = createClient();
    if (!supabase.from) {
      setData(fallback);
      setLoading(false);
      return;
    }
    if (!hasDataRef.current) setLoading(true);
    const { data: rows, error } = await supabase.from(table).select("*");
    if (id !== fetchIdRef.current) return;
    setLoading(false);
    if (error) {
      console.error(`[Realtime] ${table} fetch`, error);
      setData(fallback);
      return;
    }
    setData((rows as T[]) ?? []);
    hasDataRef.current = true;
  }, [table]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase.channel || typeof supabase.channel !== "function") return;

    const channelName = `realtime-${table}-${Date.now()}`;
    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload: { eventType: string; new: PayloadRecord; old: PayloadRecord }) => {
          const { eventType, new: newRow, old: oldRow } = payload;
          const id = (newRow?.id ?? oldRow?.id) as string | undefined;
          if (!id && eventType !== "INSERT") return;

          // onRealtime은 setData 외부에서 호출 (렌더 중 다른 컴포넌트 setState 금지 위반 방지)
          setTimeout(() => onRealtimeRef.current?.(), 0);

          setData((prev) => {
            if (eventType === "INSERT" && newRow) return [newRow as T, ...prev];
            if (eventType === "UPDATE" && newRow) return prev.map((row) => (row.id === id ? (newRow as T) : row));
            if (eventType === "DELETE") return prev.filter((row) => row.id !== id);
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table]);

  return { data, setData, loading };
}
