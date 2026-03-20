"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { DayPicker, type DayProps } from "react-day-picker";
import type { CalendarDay } from "react-day-picker";
import { cn } from "@/lib/utils";

export type DateRange = { from: Date; to?: Date };

type RangeDragDayPickerProps = Omit<
  ComponentProps<typeof DayPicker>,
  "mode" | "selected" | "onSelect"
> & {
  selected?: DateRange | undefined;
  onSelect?: (range: DateRange | undefined) => void;
};

function normalizeRange(from: Date, to: Date): { from: Date; to: Date } {
  const a = from.getTime();
  const b = to.getTime();
  return a <= b ? { from, to } : { from: to, to: from };
}

/**
 * react-day-picker 기반 범위 선택 캘린더.
 * - 드래그: 마우스 다운 → 드래그 → 업으로 기간 선택
 * - 클릭: 시작일 클릭 후 종료일 클릭으로 기간 선택
 */
export function RangeDragDayPicker({
  selected,
  onSelect,
  disabled,
  components,
  className,
  ...rest
}: RangeDragDayPickerProps) {
  const [dragRange, setDragRange] = useState<DateRange | undefined>(undefined);
  const [pendingFrom, setPendingFrom] = useState<Date | undefined>(undefined);
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const dragRangeRef = useRef<DateRange | undefined>(undefined);
  const pendingFromRef = useRef<Date | undefined>(undefined);
  dragRangeRef.current = dragRange;
  pendingFromRef.current = pendingFrom;

  const displayRange = dragRange ?? (pendingFrom ? { from: pendingFrom } : selected);

  const endDrag = useCallback(() => {
    if (!isDraggingRef.current) return;
    const current = dragRangeRef.current;
    const wasClick = !hasMovedRef.current;
    isDraggingRef.current = false;
    hasMovedRef.current = false;

    if (current?.from) {
      const to = current.to ?? current.from;
      if (wasClick && current.from.getTime() === to.getTime()) {
        const clickedDay = current.from;
        const prev = pendingFromRef.current;
        if (prev) {
          // onSelect를 setState 업데이터 밖에서 호출해야 render 중 setState 오류를 방지
          const { from, to: toNorm } = normalizeRange(prev, clickedDay);
          setPendingFrom(undefined);
          onSelect?.({ from, to: toNorm });
        } else {
          setPendingFrom(clickedDay);
        }
      } else {
        const { from, to: toNorm } = normalizeRange(current.from, to);
        setPendingFrom(undefined);
        onSelect?.({ from, to: toNorm });
      }
    }
    setDragRange(undefined);
  }, [onSelect]);

  useEffect(() => {
    window.addEventListener("mouseup", endDrag);
    return () => window.removeEventListener("mouseup", endDrag);
  }, [endDrag]);

  const handleDayMouseDown = useCallback(
    (day: CalendarDay, modifiers: { disabled?: boolean }) => {
      if (modifiers.disabled) return;
      isDraggingRef.current = true;
      hasMovedRef.current = false;
      setDragRange({ from: day.date, to: day.date });
    },
    []
  );

  const handleDayMouseEnter = useCallback(
    (day: CalendarDay, modifiers: { disabled?: boolean }) => {
      if (!isDraggingRef.current || modifiers.disabled) return;
      hasMovedRef.current = true;
      setDragRange((prev) => {
        if (!prev?.from) return prev;
        return { ...prev, to: day.date };
      });
    },
    []
  );

  const CustomDay = useCallback(
    (props: DayProps) => {
      const { day, modifiers, onMouseDown, onMouseEnter, ...restProps } = props;
      return (
        <td
          {...restProps}
          onMouseDown={(e) => {
            onMouseDown?.(e);
            handleDayMouseDown(day, modifiers);
          }}
          onMouseEnter={(e) => {
            onMouseEnter?.(e);
            handleDayMouseEnter(day, modifiers);
          }}
        />
      );
    },
    [handleDayMouseDown, handleDayMouseEnter]
  );

  return (
    <div
      className={cn(
        "rdp-left-right [&_.rdp-months]:flex [&_.rdp-months]:flex-row [&_.rdp-month]:flex [&_.rdp-month]:flex-col [&_.rdp-month]:gap-1",
        " [&_.rdp-day]:!h-8 [&_.rdp-day]:!w-8 [&_.rdp-day_button]:!h-7 [&_.rdp-day_button]:!w-7 [&_.rdp-day_button]:!text-xs",
        " [&_.rdp-weekday]:!text-[10px] [&_.rdp-caption_label]:!text-sm [&_.rdp-nav_button]:!size-7",
        " [&_.rdp-months]:gap-4",
        className
      )}
      style={
        {
          "--rdp-day-height": "32px",
          "--rdp-day-width": "32px",
          "--rdp-day_button-height": "28px",
          "--rdp-day_button-width": "28px",
          "--rdp-months-gap": "1rem",
          "--rdp-nav_button-height": "1.75rem",
          "--rdp-nav_button-width": "1.75rem",
          "--rdp-nav-height": "2rem",
        } as React.CSSProperties
      }
    >
      <DayPicker
        mode="range"
        numberOfMonths={2}
        selected={
          displayRange?.from
            ? { from: displayRange.from, to: displayRange.to ?? displayRange.from }
            : undefined
        }
        onSelect={(r) => {
          if (isDraggingRef.current) return;
          if (r?.from) {
            onSelect?.({ from: r.from, to: r.to ?? r.from });
          } else {
            onSelect?.(undefined);
          }
          setPendingFrom(undefined);
        }}
        disabled={disabled}
        components={{ ...components, Day: CustomDay }}
        {...rest}
      />
    </div>
  );
}
