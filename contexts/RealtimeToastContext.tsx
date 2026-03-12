"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

type RealtimeToastContextType = {
  showRealtimeToast: () => void;
};

const RealtimeToastContext = createContext<RealtimeToastContextType | undefined>(undefined);

export function RealtimeToastProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const showRealtimeToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(true);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      timerRef.current = null;
    }, 3000);
  }, []);

  return (
    <RealtimeToastContext.Provider value={{ showRealtimeToast }}>
      {children}
      {visible && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[100] rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 shadow-lg"
        >
          🔄 데이터가 실시간으로 업데이트되었습니다.
        </div>
      )}
    </RealtimeToastContext.Provider>
  );
}

export function useRealtimeToast(): RealtimeToastContextType | undefined {
  return useContext(RealtimeToastContext);
}
