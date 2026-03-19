"use client";

import React from "react";
import { AppleGanttChart, type AppleGanttTask } from "@/components/gantt/AppleGanttChart";

const data: AppleGanttTask[] = [
  { id: 1, name: "Task A", team: "더널리", start: "Mar 01", end: "Mar 15", progress: 60 },
  { id: 2, name: "Task B", team: "티제이웹", start: "Mar 10", end: "Apr 05", progress: 100 },
  { id: 3, name: "Task C", team: "경영지원", start: "Mar 05", end: "Mar 25", progress: 20 },
  { id: 4, name: "Task D", team: "더널리", start: "Mar 12", end: "Mar 29", progress: 45 },
  { id: 5, name: "Task E", team: "티제이웹", start: "Mar 01", end: "Mar 31", progress: 78 },
  { id: 6, name: "Task F", team: "경영지원", start: "Mar 18", end: "Apr 12", progress: 10 },
  { id: 7, name: "Task G", team: "더널리", start: "Mar 22", end: "Mar 30", progress: 0 },
  { id: 8, name: "Task H", team: "티제이웹", start: "Mar 06", end: "Mar 20", progress: 88 },
];

export default function GanttPreviewPage() {
  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Apple 스타일 Gantt 프리뷰</h1>
        <p className="mt-1 text-sm text-slate-600">
          이미지 구조/레이아웃을 바탕으로, 진행률(%) 바 차오름과 빈 구간 가시성을 포함한 목업입니다.
        </p>
      </div>
      <AppleGanttChart data={data} initialMonth={new Date(2026, 2, 1)} />
    </div>
  );
}

