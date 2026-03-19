/**
 * 대시보드 공지사항 API 클라이언트 (Supabase announcements 테이블)
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

function dbRowToAnnouncement(row: Record<string, unknown>): DashboardAnnouncement {
  return {
    id: row.id as string,
    title: row.title as string,
    body: (row.body as string) ?? undefined,
    date: row.date as string,
    isImportant: !!(row.is_important),
    authorId: (row.author_id as string) ?? undefined,
    authorName: (row.author_name as string) ?? undefined,
  };
}

export async function getAnnouncements(): Promise<DashboardAnnouncement[]> {
  const res = await fetch("/api/announcements");
  if (!res.ok) return [];
  const rows = await res.json() as Record<string, unknown>[];
  return Array.isArray(rows) ? rows.map(dbRowToAnnouncement) : [];
}

/** DB가 비어 있을 때만 기본 공지 시드 삽입 */
export async function seedDefaultsIfEmpty(
  defaults: Array<{ id: string; title: string; date: string; isImportant: boolean }>
): Promise<void> {
  const existing = await getAnnouncements();
  if (existing.length > 0) return;
  await Promise.all(
    defaults.map((d) =>
      fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, title: d.title, date: d.date, isImportant: d.isImportant }),
      })
    )
  );
}

export async function addAnnouncement(
  item: Omit<DashboardAnnouncement, "id">
): Promise<DashboardAnnouncement | null> {
  const res = await fetch("/api/announcements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: item.title,
      body: item.body,
      date: item.date,
      isImportant: item.isImportant,
      authorId: item.authorId,
      authorName: item.authorName,
    }),
  });
  if (!res.ok) return null;
  const row = await res.json() as Record<string, unknown>;
  return dbRowToAnnouncement(row);
}

export async function updateAnnouncement(
  id: string,
  patch: Partial<Pick<DashboardAnnouncement, "title" | "body" | "isImportant">>
): Promise<DashboardAnnouncement | null> {
  const res = await fetch(`/api/announcements/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  const row = await res.json() as Record<string, unknown>;
  return dbRowToAnnouncement(row);
}

export async function deleteAnnouncement(id: string): Promise<boolean> {
  const res = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
  return res.ok;
}
