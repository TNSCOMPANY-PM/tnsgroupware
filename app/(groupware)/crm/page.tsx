"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Building2, Search, Plus, X, Save, Trash2, RefreshCw,
  Phone, Mail, MapPin, ChevronDown, Pencil, Copy, Check,
} from "lucide-react";

interface Client {
  id: string;
  name: string;
  category: string | null;
  aliases: string[];
  contact: string | null;
  notes: string | null;
  business_number: string | null;
  representative: string | null;
  address: string | null;
  business_type: string | null;
  business_item: string | null;
  email: string | null;
  created_at: string;
}

const CATEGORIES = ["더널리", "티제이웹", "기타"] as const;
const CAT_COLOR: Record<string, string> = {
  "더널리":  "bg-blue-100 text-blue-700",
  "티제이웹": "bg-violet-100 text-violet-700",
  "기타":    "bg-slate-100 text-slate-600",
};

const emptyForm = (): Record<string, string | string[]> => ({
  name: "", category: "", aliases: [] as string[],
  contact: "", notes: "", business_number: "", representative: "",
  address: "", business_type: "", business_item: "", email: "",
});

/* 사업자등록번호 포맷 XXX-XX-XXXXX */
function formatBizNum(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

export default function CrmPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Client | null>(null);
  const [form, setForm] = useState<Record<string, string | string[]>>(emptyForm());
  const [aliasInput, setAliasInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [remapping, setRemapping] = useState(false);
  const [remapMsg, setRemapMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const aliasInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/clients");
    const data = res.ok ? await res.json() : [];
    setClients(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return clients.filter((c) => {
      const catOk = !catFilter || c.category === catFilter;
      const searchOk = !q ||
        c.name.toLowerCase().includes(q) ||
        (c.business_number ?? "").includes(q) ||
        (c.representative ?? "").toLowerCase().includes(q) ||
        (c.contact ?? "").includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.address ?? "").toLowerCase().includes(q) ||
        c.aliases.some((a) => a.toLowerCase().includes(q));
      return catOk && searchOk;
    });
  }, [clients, search, catFilter]);

  function openNew() {
    setEditTarget(null);
    setForm(emptyForm());
    setAliasInput("");
    setModalOpen(true);
  }

  function openEdit(c: Client) {
    setEditTarget(c);
    setForm({
      name: c.name, category: c.category ?? "", aliases: [...c.aliases],
      contact: c.contact ?? "", notes: c.notes ?? "",
      business_number: c.business_number ?? "", representative: c.representative ?? "",
      address: c.address ?? "", business_type: c.business_type ?? "",
      business_item: c.business_item ?? "", email: c.email ?? "",
    });
    setAliasInput("");
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setEditTarget(null); }

  const aliases = form.aliases as string[];

  function addAlias() {
    const v = aliasInput.trim();
    if (!v || aliases.includes(v)) { setAliasInput(""); return; }
    setForm((p) => ({ ...p, aliases: [...(p.aliases as string[]), v] }));
    setAliasInput("");
    aliasInputRef.current?.focus();
  }
  function removeAlias(a: string) {
    setForm((p) => ({ ...p, aliases: (p.aliases as string[]).filter((x) => x !== a) }));
  }

  function setField(key: string, val: string) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  async function handleSave() {
    if (!(form.name as string).trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: (form.name as string).trim(),
        category: (form.category as string) || null,
        aliases: form.aliases,
        contact: (form.contact as string).trim() || null,
        notes: (form.notes as string).trim() || null,
        business_number: (form.business_number as string).trim() || null,
        representative: (form.representative as string).trim() || null,
        address: (form.address as string).trim() || null,
        business_type: (form.business_type as string).trim() || null,
        business_item: (form.business_item as string).trim() || null,
        email: (form.email as string).trim() || null,
      };
      const url = editTarget ? `/api/clients/${editTarget.id}` : "/api/clients";
      const method = editTarget ? "PUT" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
      closeModal();
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 오류");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editTarget) return;
    if (!confirm(`"${editTarget.name}"을(를) 삭제하시겠습니까?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/clients/${editTarget.id}`, { method: "DELETE" });
      await load();
      closeModal();
    } finally {
      setDeleting(false);
    }
  }

  async function handleRemap() {
    setRemapping(true);
    setRemapMsg(null);
    try {
      const res = await fetch("/api/clients/remap", { method: "POST" });
      const json = await res.json();
      setRemapMsg(`✓ ${json.updated}건 자동 매핑 완료`);
    } catch {
      setRemapMsg("재매핑 실패");
    } finally {
      setRemapping(false);
    }
  }

  function copyBizNum(num: string, id: string) {
    navigator.clipboard.writeText(num.replace(/-/g, ""));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Building2 className="size-5 text-slate-500" />
          <h1 className="text-lg font-bold text-slate-800">거래처 관리</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {clients.length}개
          </span>
        </div>
        <div className="flex items-center gap-2">
          {remapMsg && (
            <span className="text-sm text-emerald-600">{remapMsg}</span>
          )}
          <button
            onClick={handleRemap}
            disabled={remapping}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${remapping ? "animate-spin" : ""}`} />
            미매핑 재적용
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            <Plus className="size-4" />
            거래처 등록
          </button>
        </div>
      </div>

      {/* ── 필터바 ── */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        {/* 카테고리 */}
        <div className="relative">
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-7 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            <option value="">전체 카테고리</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
        </div>
        {/* 검색 */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="상호, 사업자등록번호, 대표자, 주소, 이메일, 입금자명 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>
      </div>

      {/* ── 테이블 ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 text-left">No.</th>
              <th className="px-4 py-3 text-left">상호(법인명)</th>
              <th className="px-4 py-3 text-left">사업자등록번호</th>
              <th className="px-4 py-3 text-left">대표자</th>
              <th className="px-4 py-3 text-left">카테고리</th>
              <th className="px-4 py-3 text-left">입금자명</th>
              <th className="px-4 py-3 text-left">연락처</th>
              <th className="px-4 py-3 text-left">이메일</th>
              <th className="px-4 py-3 text-left">메모</th>
              <th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading && (
              <tr><td colSpan={10} className="py-12 text-center text-slate-400">로딩 중...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={10} className="py-12 text-center text-slate-400">
                {search || catFilter ? "검색 결과가 없습니다" : "등록된 거래처가 없습니다. 거래처를 추가해보세요."}
              </td></tr>
            )}
            {filtered.map((c, i) => (
              <tr key={c.id} className="group transition hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{c.name}</div>
                  {c.address && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                      <MapPin className="size-3" />{c.address}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {c.business_number ? (
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-slate-600">{c.business_number}</span>
                      <button
                        onClick={() => copyBizNum(c.business_number!, c.id)}
                        className="text-slate-300 opacity-0 transition hover:text-slate-500 group-hover:opacity-100"
                      >
                        {copiedId === c.id
                          ? <Check className="size-3.5 text-emerald-500" />
                          : <Copy className="size-3.5" />}
                      </button>
                    </div>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3 text-slate-700">{c.representative || <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-3">
                  {c.category
                    ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CAT_COLOR[c.category] ?? "bg-slate-100 text-slate-600"}`}>{c.category}</span>
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  {c.aliases.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {c.aliases.slice(0, 2).map((a) => (
                        <span key={a} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{a}</span>
                      ))}
                      {c.aliases.length > 2 && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-400">+{c.aliases.length - 2}</span>
                      )}
                    </div>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  {c.contact
                    ? <div className="flex items-center gap-1 text-slate-600"><Phone className="size-3 text-slate-300" />{c.contact}</div>
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {c.email
                    ? <div className="flex items-center gap-1"><Mail className="size-3 text-slate-300" />{c.email}</div>
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="max-w-[160px] px-4 py-3 text-slate-500">
                  <p className="truncate text-xs">{c.notes || <span className="text-slate-300">—</span>}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => openEdit(c)}
                    className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 opacity-0 shadow-sm transition hover:border-slate-300 hover:text-slate-700 group-hover:opacity-100"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 등록/수정 모달 ── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeModal}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-[620px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="font-semibold text-slate-800">
                {editTarget ? "거래처 수정" : "거래처 등록"}
              </h2>
              <button onClick={closeModal} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>

            {/* 모달 바디 */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* § 사업자 정보 */}
              <section>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">사업자 정보</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-600">상호(법인명) <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={form.name as string}
                      onChange={(e) => setField("name", e.target.value)}
                      placeholder="예) 주식회사 티앤에스컴퍼니"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">사업자등록번호</label>
                    <input
                      type="text"
                      value={form.business_number as string}
                      onChange={(e) => setField("business_number", formatBizNum(e.target.value))}
                      placeholder="000-00-00000"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">대표자</label>
                    <input
                      type="text"
                      value={form.representative as string}
                      onChange={(e) => setField("representative", e.target.value)}
                      placeholder="홍길동"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-600">주소</label>
                    <input
                      type="text"
                      value={form.address as string}
                      onChange={(e) => setField("address", e.target.value)}
                      placeholder="서울시 강남구..."
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">업태</label>
                    <input
                      type="text"
                      value={form.business_type as string}
                      onChange={(e) => setField("business_type", e.target.value)}
                      placeholder="서비스업"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">종목</label>
                    <input
                      type="text"
                      value={form.business_item as string}
                      onChange={(e) => setField("business_item", e.target.value)}
                      placeholder="광고대행"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                </div>
              </section>

              {/* § 입금 및 연락처 */}
              <section>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">입금 및 연락처</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">전화번호</label>
                    <input
                      type="text"
                      value={form.contact as string}
                      onChange={(e) => setField("contact", e.target.value)}
                      placeholder="02-0000-0000"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">세금계산서 이메일</label>
                    <input
                      type="email"
                      value={form.email as string}
                      onChange={(e) => setField("email", e.target.value)}
                      placeholder="tax@example.com"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-600">카테고리</label>
                    <div className="flex gap-2">
                      {(["", ...CATEGORIES] as string[]).map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setField("category", cat)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                            (form.category as string) === cat
                              ? "bg-slate-800 text-white"
                              : "border border-slate-200 text-slate-500 hover:border-slate-300"
                          }`}
                        >
                          {cat || "없음"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      입금자명 (별칭)
                      <span className="ml-1 font-normal text-slate-400">— SMS 입금자명과 일치해야 자동 매핑됩니다</span>
                    </label>
                    <div className="min-h-[40px] flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 focus-within:ring-2 focus-within:ring-slate-200">
                      {aliases.map((a) => (
                        <span key={a} className="flex items-center gap-0.5 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          {a}
                          <button onClick={() => removeAlias(a)} className="ml-0.5 text-slate-400 hover:text-slate-700"><X className="size-3" /></button>
                        </span>
                      ))}
                      <input
                        ref={aliasInputRef}
                        type="text"
                        value={aliasInput}
                        onChange={(e) => setAliasInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAlias(); } }}
                        placeholder={aliases.length === 0 ? "입금자명 입력 후 Enter" : ""}
                        className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-slate-300"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* § 메모 */}
              <section>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">메모</p>
                <textarea
                  value={form.notes as string}
                  onChange={(e) => setField("notes", e.target.value)}
                  placeholder="계약 조건, 특이사항 등..."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </section>
            </div>

            {/* 모달 푸터 */}
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              <div>
                {editTarget && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                    {deleting ? "삭제 중..." : "삭제"}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={closeModal}
                  className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !(form.name as string).trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  <Save className="size-4" />
                  {saving ? "저장 중..." : editTarget ? "수정 완료" : "등록"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
