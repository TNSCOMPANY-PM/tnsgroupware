/**
 * 대시보드 공지사항 localStorage 저장/로드 (C레벨 작성)
 */

export interface DashboardAnnouncement {
  id: string;
  title: string;
  body?: string;
  date: string;
  isImportant: boolean;
  authorId?: string;
  authorName?: string;
}

const STORAGE_KEY = "dashboard-announcements";

function loadFromStorage(): DashboardAnnouncement[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DashboardAnnouncement[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(items: DashboardAnnouncement[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function getAnnouncements(): DashboardAnnouncement[] {
  return loadFromStorage();
}

/** 저장소가 비어 있을 때만 기본 공지로 채움 (한 번만) */
export function seedDefaultsIfEmpty(
  defaults: Array<{ id: string; title: string; date: string; isImportant: boolean }>
): void {
  const cur = loadFromStorage();
  if (cur.length > 0) return;
  saveToStorage(
    defaults.map((d) => ({
      ...d,
      body: undefined,
      authorId: undefined,
      authorName: undefined,
    }))
  );
}

export function addAnnouncement(
  item: Omit<DashboardAnnouncement, "id">
): DashboardAnnouncement {
  const list = loadFromStorage();
  const id = `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const newItem: DashboardAnnouncement = { ...item, id };
  list.unshift(newItem);
  saveToStorage(list);
  return newItem;
}

export function updateAnnouncement(
  id: string,
  patch: Partial<Pick<DashboardAnnouncement, "title" | "body" | "isImportant">>
): DashboardAnnouncement | null {
  const list = loadFromStorage();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx]!, ...patch };
  saveToStorage(list);
  return list[idx]!;
}

export function deleteAnnouncement(id: string): boolean {
  const list = loadFromStorage().filter((a) => a.id !== id);
  if (list.length === loadFromStorage().length) return false;
  saveToStorage(list);
  return true;
}
