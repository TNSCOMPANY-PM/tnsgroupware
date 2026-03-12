"use client";

import { useState, useEffect, useRef } from "react";
import { formatWonIntl } from "@/utils/formatWon";

const DURATION_MS = 600;

export function CountUp({
  value,
  className = "",
  format = "won",
}: {
  value: number;
  className?: string;
  format?: "won" | "percent";
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValueRef = useRef(value);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    const target = value;
    const start = prevValueRef.current;
    if (start === target) return;

    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - t, 2);
      const next = start + (target - start) * eased;
      setDisplayValue(format === "percent" ? next : Math.round(next));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else prevValueRef.current = target;
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, format]);

  const text =
    format === "percent"
      ? `${displayValue.toFixed(1)}%`
      : formatWonIntl(Math.round(displayValue));

  return <span className={className}>{text}</span>;
}
