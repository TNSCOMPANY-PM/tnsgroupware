import { TNS_SHEET_ROWS, type TnsSheetRow } from "@/constants/tnsSheet";

const STORAGE_KEY = "tns-sheet-rows";

function genId(): string {
  return `tns-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadTnsSheetRows(): TnsSheetRow[] {
  if (typeof window === "undefined") return TNS_SHEET_ROWS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return TNS_SHEET_ROWS;
    const parsed = JSON.parse(raw) as TnsSheetRow[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : TNS_SHEET_ROWS;
  } catch {
    return TNS_SHEET_ROWS;
  }
}

export function saveTnsSheetRows(rows: TnsSheetRow[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // ignore
  }
}

export { genId };
export type { TnsSheetRow };
