"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { loadTnsSheetRows, saveTnsSheetRows, genId, type TnsSheetRow } from "@/lib/tnsSheetStorage";
import { Link2, FileText, Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS: { key: TnsSheetRow["section"]; label: string }[] = [
  { key: "TNS관리시트", label: "TNS 관리시트" },
  { key: "마케팅사업부", label: "마케팅사업부 관리시트" },
  { key: "권한별정렬", label: "권한별 정렬" },
];

const PERMISSION_OPTIONS = ["전체", "총괄 이상", "팀장 이상", "임원진만", "-"];

export default function SheetsPage() {
  const [filter, setFilter] = useState<TnsSheetRow["section"] | "all">("all");
  const [rows, setRows] = useState<TnsSheetRow[]>([]);

  useEffect(() => {
    setRows(loadTnsSheetRows());
  }, []);

  const persist = useCallback((next: TnsSheetRow[]) => {
    setRows(next);
    saveTnsSheetRows(next);
  }, []);

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.section === filter);
  }, [rows, filter]);

  const grouped = useMemo(() => {
    const map = new Map<TnsSheetRow["section"], TnsSheetRow[]>();
    for (const r of rows) {
      const list = map.get(r.section) ?? [];
      list.push(r);
      map.set(r.section, list);
    }
    return map;
  }, [rows]);

  // 추가/수정 모달
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<TnsSheetRow | null>(null);
  const [formSection, setFormSection] = useState<TnsSheetRow["section"]>("TNS관리시트");
  const [form, setForm] = useState({ documentName: "", permission: "전체", link: "", manager: "" });

  const openAdd = (section?: TnsSheetRow["section"]) => {
    setEditingRow(null);
    setFormSection(section ?? "TNS관리시트");
    setForm({ documentName: "", permission: "전체", link: "", manager: "" });
    setModalOpen(true);
  };

  const openEdit = (row: TnsSheetRow) => {
    setEditingRow(row);
    setFormSection(row.section);
    setForm({
      documentName: row.documentName,
      permission: row.permission,
      link: row.link || "",
      manager: row.manager,
    });
    setModalOpen(true);
  };

  const saveRow = () => {
    if (!form.documentName.trim()) return;
    const link = form.link.trim() || "#";
    const doc: TnsSheetRow = {
      id: editingRow?.id ?? genId(),
      section: formSection,
      documentName: form.documentName.trim(),
      permission: form.permission.trim() || "-",
      link,
      manager: form.manager.trim() || "-",
    };
    if (editingRow) {
      persist(rows.map((r) => (r.id === editingRow.id ? doc : r)));
    } else {
      persist([...rows, doc]);
    }
    setModalOpen(false);
  };

  const deleteRow = (row: TnsSheetRow) => {
    if (!confirm(`"${row.documentName}" 문서를 삭제할까요?`)) return;
    persist(rows.filter((r) => r.id !== row.id));
  };

  const hasLink = (link: string) => link && link !== "#";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">TNS 시트 정리</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            문서별 공개권한 및 관리자 (전체 공개)
          </p>
        </div>
        <Button onClick={() => openAdd()} className="gap-1">
          <Plus className="size-4" />
          문서 추가
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            filter === "all"
              ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
              : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]/80"
          )}
        >
          전체
        </button>
        {SECTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              filter === key
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]/80"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {SECTIONS.filter((s) => filter === "all" || filter === s.key).map(({ key, label }) => {
          const sectionRows = grouped.get(key) ?? [];
          if (sectionRows.length === 0 && filter !== "all") return null;
          return (
            <Card key={key} className="overflow-hidden border-[var(--border)] bg-[var(--background)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3">
                <h2 className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
                  <FileText className="size-4" />
                  {label}
                </h2>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => openAdd(key)}>
                  <Plus className="size-4" />
                  추가
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50">
                      <th className="px-4 py-3 font-medium text-[var(--muted-foreground)]">문서명</th>
                      <th className="px-4 py-3 font-medium text-[var(--muted-foreground)]">공개권한</th>
                      <th className="px-4 py-3 font-medium text-[var(--muted-foreground)]">링크</th>
                      <th className="px-4 py-3 font-medium text-[var(--muted-foreground)]">관리자(정/부)</th>
                      <th className="w-24 px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {sectionRows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-[var(--border)]/60 transition-colors hover:bg-[var(--muted)]/30"
                      >
                        <td className="px-4 py-3 font-medium text-[var(--foreground)]">{row.documentName}</td>
                        <td className="px-4 py-3 text-[var(--foreground)]">{row.permission}</td>
                        <td className="px-4 py-3">
                          {hasLink(row.link) ? (
                            <a
                              href={row.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline break-all max-w-[200px]"
                            >
                              <Link2 className="size-4 shrink-0" />
                              <span className="truncate">링크</span>
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[var(--muted-foreground)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[var(--muted-foreground)]">{row.manager}</td>
                        <td className="px-2 py-3">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(row)} aria-label="수정">
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-8 text-red-600 hover:text-red-700" onClick={() => deleteRow(row)} aria-label="삭제">
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sectionRows.length === 0 && (
                <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                  문서가 없습니다. 추가 버튼으로 등록하세요.
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {filteredRows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--muted)]/20 py-12 text-center text-[var(--muted-foreground)]">
          해당 구간에 문서가 없습니다.
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-[600px] border-[var(--border)] bg-[var(--background)]">
          <DialogHeader>
            <DialogTitle>{editingRow ? "문서 수정" : "문서 추가"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>구간</Label>
              <Select value={formSection} onValueChange={(v) => setFormSection(v as TnsSheetRow["section"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTIONS.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>문서명</Label>
              <Input
                value={form.documentName}
                onChange={(e) => setForm((f) => ({ ...f, documentName: e.target.value }))}
                placeholder="예: 2024매출통계"
              />
            </div>
            <div className="space-y-2">
              <Label>공개권한</Label>
              <Select value={form.permission} onValueChange={(v) => setForm((f) => ({ ...f, permission: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERMISSION_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>링크 (URL)</Label>
              <Input
                type="url"
                value={form.link}
                onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
                placeholder="https://docs.google.com/... 또는 시트 링크"
              />
            </div>
            <div className="space-y-2">
              <Label>관리자(정/부)</Label>
              <Input
                value={form.manager}
                onChange={(e) => setForm((f) => ({ ...f, manager: e.target.value }))}
                placeholder="예: 박재민/김정섭"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              취소
            </Button>
            <Button onClick={saveRow}>{editingRow ? "저장" : "추가"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
