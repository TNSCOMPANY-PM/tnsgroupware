"use client";

import { useState, useEffect, useRef } from "react";
import {
  Building2,
  Search,
  Plus,
  X,
  Save,
  Trash2,
  RefreshCw,
  Tag,
  Phone,
  FileText,
} from "lucide-react";

interface Client {
  id: string;
  name: string;
  category: string | null;
  aliases: string[];
  contact: string | null;
  notes: string | null;
  created_at: string;
}

const CATEGORIES = ["더널리", "티제이웹", "기타"] as const;

const emptyForm = {
  name: "",
  category: "" as string,
  aliases: [] as string[],
  contact: "",
  notes: "",
};

export default function CrmPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Client | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [aliasInput, setAliasInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [remapping, setRemapping] = useState(false);
  const [remapResult, setRemapResult] = useState<string | null>(null);
  const aliasInputRef = useRef<HTMLInputElement>(null);

  async function fetchClients() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("고객사 목록 로드 실패");
      const data: Client[] = await res.json();
      setClients(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchClients();
  }, []);

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.category ?? "").toLowerCase().includes(q) ||
      c.aliases.some((a) => a.toLowerCase().includes(q))
    );
  });

  function openNew() {
    setSelected(null);
    setIsNew(true);
    setForm(emptyForm);
    setAliasInput("");
    setRemapResult(null);
  }

  function openEdit(client: Client) {
    setSelected(client);
    setIsNew(false);
    setForm({
      name: client.name,
      category: client.category ?? "",
      aliases: [...client.aliases],
      contact: client.contact ?? "",
      notes: client.notes ?? "",
    });
    setAliasInput("");
    setRemapResult(null);
  }

  function addAlias() {
    const trimmed = aliasInput.trim();
    if (!trimmed || form.aliases.includes(trimmed)) {
      setAliasInput("");
      return;
    }
    setForm((prev) => ({ ...prev, aliases: [...prev.aliases, trimmed] }));
    setAliasInput("");
    aliasInputRef.current?.focus();
  }

  function removeAlias(alias: string) {
    setForm((prev) => ({ ...prev, aliases: prev.aliases.filter((a) => a !== alias) }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category || null,
        aliases: form.aliases,
        contact: form.contact.trim() || null,
        notes: form.notes.trim() || null,
      };

      if (isNew) {
        const res = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("저장 실패");
        const created: Client = await res.json();
        setClients((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setSelected(created);
        setIsNew(false);
        setForm({
          name: created.name,
          category: created.category ?? "",
          aliases: [...created.aliases],
          contact: created.contact ?? "",
          notes: created.notes ?? "",
        });
      } else if (selected) {
        const res = await fetch(`/api/clients/${selected.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("수정 실패");
        const updated: Client = await res.json();
        setClients((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c)).sort((a, b) => a.name.localeCompare(b.name))
        );
        setSelected(updated);
        setForm({
          name: updated.name,
          category: updated.category ?? "",
          aliases: [...updated.aliases],
          contact: updated.contact ?? "",
          notes: updated.notes ?? "",
        });
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 오류");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    if (!confirm(`"${selected.name}"을(를) 삭제하시겠습니까?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/clients/${selected.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
      setClients((prev) => prev.filter((c) => c.id !== selected.id));
      setSelected(null);
      setIsNew(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 오류");
    } finally {
      setDeleting(false);
    }
  }

  async function handleRemap() {
    setRemapping(true);
    setRemapResult(null);
    try {
      const res = await fetch("/api/clients/remap", { method: "POST" });
      if (!res.ok) throw new Error("재매핑 실패");
      const json = await res.json();
      setRemapResult(`${json.updated}건 업데이트됨`);
    } catch (e) {
      setRemapResult(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setRemapping(false);
    }
  }

  const showPanel = isNew || selected !== null;

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="size-6 text-slate-600" />
          <h1 className="text-xl font-bold text-slate-800">고객사 CRM</h1>
        </div>
        <div className="flex items-center gap-2">
          {remapResult && (
            <span className="text-sm text-slate-500">{remapResult}</span>
          )}
          <button
            onClick={handleRemap}
            disabled={remapping}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${remapping ? "animate-spin" : ""}`} />
            기존 미매핑 재매핑
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700"
          >
            <Plus className="size-4" />
            고객사 추가
          </button>
        </div>
      </div>

      {/* 본문 */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* 좌측 목록 */}
        <div className="flex w-80 flex-shrink-0 flex-col gap-3">
          {/* 검색 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="고객사명, 카테고리, 별칭 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          {/* 목록 */}
          <div className="flex flex-col gap-1.5 overflow-y-auto">
            {loading && (
              <div className="rounded-xl bg-white p-4 text-center text-sm text-slate-400 shadow-sm">
                로딩 중...
              </div>
            )}
            {error && (
              <div className="rounded-xl bg-red-50 p-4 text-center text-sm text-red-500 shadow-sm">
                {error}
              </div>
            )}
            {!loading && !error && filtered.length === 0 && (
              <div className="rounded-xl bg-white p-4 text-center text-sm text-slate-400 shadow-sm">
                고객사가 없습니다
              </div>
            )}
            {filtered.map((client) => (
              <button
                key={client.id}
                onClick={() => openEdit(client)}
                className={`flex flex-col gap-0.5 rounded-xl border px-4 py-3 text-left shadow-sm transition ${
                  selected?.id === client.id
                    ? "border-slate-400 bg-slate-800 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="text-sm font-semibold">{client.name}</span>
                <div className="flex items-center gap-2">
                  {client.category && (
                    <span
                      className={`text-xs ${
                        selected?.id === client.id ? "text-slate-300" : "text-slate-400"
                      }`}
                    >
                      {client.category}
                    </span>
                  )}
                  {client.aliases.length > 0 && (
                    <span
                      className={`text-xs ${
                        selected?.id === client.id ? "text-slate-400" : "text-slate-300"
                      }`}
                    >
                      별칭 {client.aliases.length}개
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 우측 편집 패널 */}
        {showPanel ? (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-800">
              {isNew ? "새 고객사 추가" : "고객사 편집"}
            </h2>

            {/* 기업명 */}
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                <Building2 className="size-4" />
                기업명 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="기업명을 입력하세요"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              />
            </div>

            {/* 카테고리 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-600">카테고리</label>
              <select
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              >
                <option value="">없음</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* 입금자명(별칭) */}
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                <Tag className="size-4" />
                입금자명 (별칭)
              </label>
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 p-2">
                {form.aliases.map((alias) => (
                  <span
                    key={alias}
                    className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                  >
                    {alias}
                    <button
                      onClick={() => removeAlias(alias)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  ref={aliasInputRef}
                  type="text"
                  value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAlias();
                    }
                  }}
                  placeholder="입금자명 입력 후 Enter"
                  className="min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-300"
                />
              </div>
              <p className="text-xs text-slate-400">
                SMS 입금 알림의 입금자명과 일치해야 자동 매핑됩니다
              </p>
            </div>

            {/* 담당자 연락처 */}
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                <Phone className="size-4" />
                담당자 연락처
              </label>
              <input
                type="text"
                value={form.contact}
                onChange={(e) => setForm((prev) => ({ ...prev, contact: e.target.value }))}
                placeholder="010-0000-0000"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              />
            </div>

            {/* 메모 */}
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                <FileText className="size-4" />
                메모
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="메모를 입력하세요"
                rows={4}
                className="resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              />
            </div>

            {/* 버튼 */}
            <div className="flex items-center justify-between pt-2">
              <div>
                {!isNew && selected && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-500 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                    {deleting ? "삭제 중..." : "삭제"}
                  </button>
                )}
              </div>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-50"
              >
                <Save className="size-4" />
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white">
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <Building2 className="size-10" />
              <p className="text-sm">고객사를 선택하거나 새로 추가하세요</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
