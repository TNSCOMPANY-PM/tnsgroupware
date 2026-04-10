import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

/** 한국 법정 공휴일 fallback (nager.at API 실패 시) */
const FALLBACK_HOLIDAYS: Record<number, string[]> = {
  2025: [
    "2025-01-01", "2025-01-28", "2025-01-29", "2025-01-30",
    "2025-03-01", "2025-03-03",
    "2025-05-05", "2025-05-06", "2025-05-25",
    "2025-06-06", "2025-08-15",
    "2025-10-03", "2025-10-04", "2025-10-05", "2025-10-09",
    "2025-12-25",
  ],
  2026: [
    "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18",
    "2026-03-01", "2026-03-02",
    "2026-05-05", "2026-05-24", "2026-05-25",
    "2026-06-06", "2026-07-17", "2026-08-15", "2026-08-17",
    "2026-09-24", "2026-09-25", "2026-09-26",
    "2026-10-03", "2026-10-05", "2026-10-09", "2026-12-25",
  ],
  2027: [
    "2027-01-01", "2027-02-08", "2027-02-09", "2027-02-10",
    "2027-03-01", "2027-05-05", "2027-05-13", "2027-06-06",
    "2027-08-15", "2027-09-14", "2027-09-15", "2027-09-16",
    "2027-10-03", "2027-10-09", "2027-12-25",
  ],
};

export async function GET(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());

  try {
    // date.nager.at — 무료 공휴일 API (API 키 불필요)
    const res = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/KR`,
      { next: { revalidate: 86400 } } // 하루 캐시
    );
    if (!res.ok) throw new Error(`status ${res.status}`);
    const raw = await res.json() as { date: string }[];
    const holidays = raw.map((h) => h.date);
    return NextResponse.json({ year, holidays, source: "nager.at" });
  } catch {
    const holidays = FALLBACK_HOLIDAYS[year] ?? [];
    return NextResponse.json({ year, holidays, source: "fallback" });
  }
}
