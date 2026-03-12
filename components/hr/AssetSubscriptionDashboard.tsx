"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Lock,
  CreditCard,
  Folders,
  Eye,
  EyeOff,
  Copy,
  ChevronDown,
  ChevronRight,
  Receipt,
  Monitor,
  Plus,
  Pencil,
  Trash2,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type PaymentMethod,
  type SubscriptionRow,
  type SharedAccount,
  type SharedAccountGroup,
  type EditLogEntry,
  loadSubscriptions,
  loadSharedAccounts,
  loadEditLog,
  saveSubscriptions,
  saveSharedAccounts,
  addEditLog,
  genId,
} from "@/lib/assetSubscriptionStorage";

function PaymentBadge({ method }: { method: PaymentMethod }) {
  const styles: Record<PaymentMethod, string> = {
    "대표님카드": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    "한이사님카드": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    "자동이체/무통장": "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        styles[method]
      )}
    >
      {method}
    </span>
  );
}

function formatWon(n: number) {
  return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(n);
}

function formatLogTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}

export function AssetSubscriptionDashboard() {
  const [activeTab, setActiveTab] = useState("subscriptions");
  const [openCategory, setOpenCategory] = useState<string | null>("광고");
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [sharedAccounts, setSharedAccounts] = useState<SharedAccountGroup[]>([]);
  const [editLogs, setEditLogs] = useState<EditLogEntry[]>([]);

  useEffect(() => {
    setSubscriptions(loadSubscriptions());
    setSharedAccounts(loadSharedAccounts());
    setEditLogs(loadEditLog());
  }, []);

  const persistSubscriptions = useCallback((next: SubscriptionRow[]) => {
    setSubscriptions(next);
    saveSubscriptions(next);
  }, []);

  const persistAccounts = useCallback((next: SharedAccountGroup[]) => {
    setSharedAccounts(next);
    saveSharedAccounts(next);
  }, []);

  const refreshEditLog = useCallback(() => {
    setEditLogs(loadEditLog());
  }, []);

  const togglePassword = useCallback((id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const copyToClipboard = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
  }, []);

  // ——— 정기결제 추가/수정/삭제 ———
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<SubscriptionRow | null>(null);
  const [subForm, setSubForm] = useState({ day: 1, service: "", method: "대표님카드" as PaymentMethod, amount: 0, note: "" });

  const openAddSub = () => {
    setEditingSub(null);
    setSubForm({ day: 1, service: "", method: "대표님카드", amount: 0, note: "" });
    setSubModalOpen(true);
  };

  const openEditSub = (row: SubscriptionRow) => {
    setEditingSub(row);
    setSubForm({ day: row.day, service: row.service, method: row.method, amount: row.amount, note: row.note });
    setSubModalOpen(true);
  };

  const saveSub = () => {
    if (!subForm.service.trim()) return;
    const amount = Number(subForm.amount) || 0;
    if (editingSub) {
      const prev = subscriptions.find((s) => s.id === editingSub.id);
      const next = subscriptions.map((s) =>
        s.id === editingSub.id
          ? { ...s, day: subForm.day, service: subForm.service.trim(), method: subForm.method, amount, note: subForm.note.trim() }
          : s
      );
      persistSubscriptions(next);
      const changes: string[] = [];
      if (prev && prev.day !== subForm.day) changes.push(`결제일 ${prev.day}→${subForm.day}`);
      if (prev && prev.service !== subForm.service) changes.push(`서비스명`);
      if (prev && prev.method !== subForm.method) changes.push(`결제수단`);
      if (prev && prev.amount !== amount) changes.push(`금액`);
      if (prev && prev.note !== subForm.note) changes.push(`비고`);
      addEditLog("edit", "subscription", subForm.service.trim(), changes.length ? changes.join(", ") : undefined);
    } else {
      const newRow: SubscriptionRow = {
        id: genId(),
        day: subForm.day,
        service: subForm.service.trim(),
        method: subForm.method,
        amount,
        note: subForm.note.trim(),
      };
      persistSubscriptions([...subscriptions, newRow]);
      addEditLog("add", "subscription", newRow.service);
    }
    refreshEditLog();
    setSubModalOpen(false);
  };

  const deleteSub = (row: SubscriptionRow) => {
    if (!confirm(`"${row.service}" 정기결제를 삭제할까요?`)) return;
    persistSubscriptions(subscriptions.filter((s) => s.id !== row.id));
    addEditLog("delete", "subscription", row.service);
    refreshEditLog();
  };

  // ——— 공용 계정 추가/수정/삭제 ———
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountCategory, setAccountCategory] = useState("");
  const [editingAccount, setEditingAccount] = useState<{ groupIdx: number; item: SharedAccount } | null>(null);
  const [accountForm, setAccountForm] = useState({ name: "", loginId: "", password: "" });

  const openAddAccount = (category: string) => {
    setAccountCategory(category);
    setEditingAccount(null);
    setAccountForm({ name: "", loginId: "", password: "" });
    setAccountModalOpen(true);
  };

  const openEditAccount = (groupIdx: number, item: SharedAccount) => {
    const group = sharedAccounts[groupIdx];
    setAccountCategory(group.category);
    setEditingAccount({ groupIdx, item });
    setAccountForm({ name: item.name, loginId: item.loginId, password: item.password });
    setAccountModalOpen(true);
  };

  const saveAccount = () => {
    if (!accountForm.name.trim()) return;
    const groupIdx = sharedAccounts.findIndex((g) => g.category === accountCategory);
    if (groupIdx === -1) return;
    const group = sharedAccounts[groupIdx];
    if (editingAccount) {
      const nextGroups = sharedAccounts.map((g, i) =>
        i !== groupIdx
          ? g
          : {
              ...g,
              items: g.items.map((it) =>
                it.id === editingAccount.item.id
                  ? { ...it, name: accountForm.name.trim(), loginId: accountForm.loginId.trim(), password: accountForm.password }
                  : it
              ),
            }
      );
      persistAccounts(nextGroups);
      addEditLog("edit", "account", accountForm.name.trim(), `카테고리: ${accountCategory}`);
    } else {
      const newItem: SharedAccount = {
        id: genId(),
        name: accountForm.name.trim(),
        loginId: accountForm.loginId.trim(),
        password: accountForm.password,
      };
      const nextGroups = sharedAccounts.map((g, i) =>
        i !== groupIdx ? g : { ...g, items: [...g.items, newItem] }
      );
      persistAccounts(nextGroups);
      addEditLog("add", "account", newItem.name, `카테고리: ${accountCategory}`);
    }
    refreshEditLog();
    setAccountModalOpen(false);
  };

  const deleteAccount = (groupIdx: number, item: SharedAccount) => {
    if (!confirm(`"${item.name}" 계정을 삭제할까요?`)) return;
    const nextGroups = sharedAccounts.map((g, i) =>
      i !== groupIdx ? g : { ...g, items: g.items.filter((it) => it.id !== item.id) }
    );
    persistAccounts(nextGroups);
    addEditLog("delete", "account", item.name, `카테고리: ${sharedAccounts[groupIdx].category}`);
    refreshEditLog();
  };

  // KPI
  const monthlyTotal = subscriptions.reduce((s, r) => s + r.amount, 0);
  const methodCounts = subscriptions.reduce(
    (acc, r) => {
      acc[r.method] = (acc[r.method] ?? 0) + 1;
      return acc;
    },
    {} as Record<PaymentMethod, number>
  );
  const methodPct = (count: number) =>
    subscriptions.length > 0 ? Math.round((count / subscriptions.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">자산 및 구독 관리</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            전사 정기결제 현황 및 공용 계정 관리 (C-Level & Team Leader Only)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Lock className="size-4 text-[var(--muted-foreground)]" aria-hidden />
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
            보안 뷰 활성화됨
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-[var(--border)] bg-[var(--background)]">
          <CardContent className="flex items-center gap-3 px-5 py-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <CreditCard className="size-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-[var(--muted-foreground)]">월 예상 고정비</p>
              <p className="text-xl font-bold text-[var(--foreground)]">{formatWon(monthlyTotal)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[var(--border)] bg-[var(--background)]">
          <CardContent className="flex items-center gap-3 px-5 py-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
              <Folders className="size-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-[var(--muted-foreground)]">활성 구독/소프트웨어</p>
              <p className="text-xl font-bold text-[var(--foreground)]">{subscriptions.length}개</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[var(--border)] bg-[var(--background)]">
          <CardContent className="px-5 py-4">
            <p className="mb-3 text-sm text-[var(--muted-foreground)]">결제수단 비중</p>
            <div className="space-y-2 text-xs">
              {(["대표님카드", "한이사님카드", "자동이체/무통장"] as const).map((m) => {
                const count = methodCounts[m] ?? 0;
                const pct = methodPct(count);
                return (
                  <div key={m} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-[var(--foreground)]">{m}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          m === "대표님카드" && "bg-blue-500",
                          m === "한이사님카드" && "bg-purple-500",
                          m === "자동이체/무통장" && "bg-gray-500"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-[var(--muted-foreground)]">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="inline-flex h-12 w-full max-w-3xl rounded-xl bg-[var(--muted)] p-1">
          <TabsTrigger
            value="subscriptions"
            className="flex-1 gap-2 rounded-lg data-[state=active]:bg-[var(--background)] data-[state=active]:shadow-sm"
          >
            <Receipt className="size-4" />
            정기결제 내역
          </TabsTrigger>
          <TabsTrigger
            value="accounts"
            className="flex-1 gap-2 rounded-lg data-[state=active]:bg-[var(--background)] data-[state=active]:shadow-sm"
          >
            <Folders className="size-4" />
            공용 계정 관리
          </TabsTrigger>
          <TabsTrigger
            value="log"
            className="flex-1 gap-2 rounded-lg data-[state=active]:bg-[var(--background)] data-[state=active]:shadow-sm"
          >
            <History className="size-4" />
            수정 로그
          </TabsTrigger>
        </TabsList>

        <TabsContent value="subscriptions" className="mt-4">
          <Card className="border-[var(--border)] overflow-hidden bg-[var(--background)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <span className="text-sm text-[var(--muted-foreground)]">정기결제 목록</span>
              <Button size="sm" onClick={openAddSub} className="gap-1">
                <Plus className="size-4" />
                추가
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50">
                    <th className="px-4 py-3 font-medium text-[var(--muted-foreground)]">결제일</th>
                    <th className="px-4 py-3 font-medium text-[var(--muted-foreground)]">서비스명</th>
                    <th className="px-4 py-3 font-medium text-[var(--muted-foreground)]">결제수단</th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--muted-foreground)]">금액</th>
                    <th className="px-4 py-3 font-medium text-[var(--muted-foreground)]">비고</th>
                    <th className="w-20 px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--border)]/60 transition-colors hover:bg-[var(--muted)]/30"
                    >
                      <td className="px-4 py-3 text-[var(--foreground)]">매월 {row.day}일</td>
                      <td className="px-4 py-3 font-medium text-[var(--foreground)]">{row.service}</td>
                      <td className="px-4 py-3">
                        <PaymentBadge method={row.method} />
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--foreground)]">{formatWon(row.amount)}</td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">{row.note || "—"}</td>
                      <td className="px-2 py-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEditSub(row)} aria-label="수정">
                            <Pencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 text-red-600 hover:text-red-700" onClick={() => deleteSub(row)} aria-label="삭제">
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {subscriptions.length === 0 && (
              <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">등록된 정기결제가 없습니다. 추가 버튼으로 등록하세요.</div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="accounts" className="mt-4">
          <div className="space-y-2">
            {sharedAccounts.map((group, groupIdx) => {
              const isOpen = openCategory === group.category;
              return (
                <Card key={group.category} className="overflow-hidden border-[var(--border)] bg-[var(--background)]">
                  <div className="flex items-center border-b border-[var(--border)]/50">
                    <button
                      type="button"
                      onClick={() => setOpenCategory(isOpen ? null : group.category)}
                      className="flex flex-1 items-center gap-3 px-5 py-4 text-left font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]/30"
                    >
                      {isOpen ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                      <Monitor className="size-4 shrink-0 text-[var(--muted-foreground)]" />
                      <span>{group.category}</span>
                      <span className="ml-auto text-xs font-normal text-[var(--muted-foreground)]">{group.items.length}개</span>
                    </button>
                    <Button variant="ghost" size="sm" className="gap-1 shrink-0 rounded-none" onClick={() => openAddAccount(group.category)}>
                      <Plus className="size-4" />
                      추가
                    </Button>
                  </div>
                  {isOpen && (
                    <div className="border-t border-[var(--border)]">
                      {group.items.map((item) => (
                        <SharedAccountRow
                          key={item.id}
                          item={item}
                          visible={!!visiblePasswords[item.id]}
                          onToggleVisible={() => togglePassword(item.id)}
                          onCopy={copyToClipboard}
                          onEdit={() => openEditAccount(groupIdx, item)}
                          onDelete={() => deleteAccount(groupIdx, item)}
                        />
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="log" className="mt-4">
          <Card className="border-[var(--border)] bg-[var(--background)]">
            <CardContent className="p-4">
              <p className="mb-3 text-sm font-medium text-[var(--foreground)]">수정 이력 (최근 {editLogs.length}건)</p>
              <ul className="space-y-2 max-h-[400px] overflow-y-auto">
                {editLogs.length === 0 ? (
                  <li className="py-4 text-center text-sm text-[var(--muted-foreground)]">수정 로그가 없습니다.</li>
                ) : (
                  editLogs.map((log) => (
                    <li
                      key={log.id}
                      className="flex flex-wrap items-baseline gap-2 rounded-lg border border-[var(--border)]/50 bg-[var(--muted)]/20 px-3 py-2 text-sm"
                    >
                      <span className="text-[var(--muted-foreground)]">{formatLogTime(log.at)}</span>
                      <span
                        className={cn(
                          "font-medium",
                          log.action === "add" && "text-green-600 dark:text-green-400",
                          log.action === "edit" && "text-blue-600 dark:text-blue-400",
                          log.action === "delete" && "text-red-600 dark:text-red-400"
                        )}
                      >
                        {log.action === "add" && "추가"}
                        {log.action === "edit" && "수정"}
                        {log.action === "delete" && "삭제"}
                      </span>
                      <span className="text-[var(--foreground)]">
                        {log.targetType === "subscription" ? "정기결제" : "공용계정"}: {log.targetName}
                      </span>
                      {log.details && <span className="text-xs text-[var(--muted-foreground)]">({log.details})</span>}
                    </li>
                  ))
                )}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 정기결제 추가/수정 모달 */}
      <Dialog open={subModalOpen} onOpenChange={setSubModalOpen}>
        <DialogContent className="max-w-[600px] bg-[var(--background)] border-[var(--border)]">
          <DialogHeader>
            <DialogTitle>{editingSub ? "정기결제 수정" : "정기결제 추가"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>결제일 (매월 N일)</Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={subForm.day || ""}
                  onChange={(e) => setSubForm((f) => ({ ...f, day: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>결제수단</Label>
                <Select value={subForm.method} onValueChange={(v) => setSubForm((f) => ({ ...f, method: v as PaymentMethod }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="대표님카드">대표님카드</SelectItem>
                    <SelectItem value="한이사님카드">한이사님카드</SelectItem>
                    <SelectItem value="자동이체/무통장">자동이체/무통장</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>서비스명</Label>
              <Input value={subForm.service} onChange={(e) => setSubForm((f) => ({ ...f, service: e.target.value }))} placeholder="예: Adobe Creative Cloud" />
            </div>
            <div className="space-y-2">
              <Label>금액 (원)</Label>
              <Input
                type="number"
                min={0}
                value={subForm.amount || ""}
                onChange={(e) => setSubForm((f) => ({ ...f, amount: Number(e.target.value) || 0 }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>비고</Label>
              <Input value={subForm.note} onChange={(e) => setSubForm((f) => ({ ...f, note: e.target.value }))} placeholder="선택" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubModalOpen(false)}>취소</Button>
            <Button onClick={saveSub}>{editingSub ? "저장" : "추가"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 공용 계정 추가/수정 모달 */}
      <Dialog open={accountModalOpen} onOpenChange={setAccountModalOpen}>
        <DialogContent className="max-w-[600px] border-[var(--border)] bg-[var(--background)]">
          <DialogHeader>
            <DialogTitle>{editingAccount ? "공용 계정 수정" : "공용 계정 추가"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>카테고리</Label>
              <Input value={accountCategory} readOnly className="bg-[var(--muted)]/50" />
            </div>
            <div className="space-y-2">
              <Label>서비스명</Label>
              <Input value={accountForm.name} onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))} placeholder="예: 메타(Meta)" />
            </div>
            <div className="space-y-2">
              <Label>아이디</Label>
              <Input value={accountForm.loginId} onChange={(e) => setAccountForm((f) => ({ ...f, loginId: e.target.value }))} placeholder="로그인 ID" />
            </div>
            <div className="space-y-2">
              <Label>비밀번호</Label>
              <Input
                type="password"
                value={accountForm.password}
                onChange={(e) => setAccountForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="비밀번호"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountModalOpen(false)}>취소</Button>
            <Button onClick={saveAccount}>{editingAccount ? "저장" : "추가"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SharedAccountRow({
  item,
  visible,
  onToggleVisible,
  onCopy,
  onEdit,
  onDelete,
}: {
  item: SharedAccount;
  visible: boolean;
  onToggleVisible: () => void;
  onCopy: (text: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)]/50 px-5 py-3 last:border-b-0 sm:flex-nowrap">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--muted)]">
        <Monitor className="size-4 text-[var(--muted-foreground)]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[var(--foreground)]">{item.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <span>ID: {item.loginId}</span>
          <span className="flex items-center gap-1">
            PW: {visible ? item.password : "••••••••"}
            <button type="button" onClick={onToggleVisible} className="rounded p-0.5 hover:bg-[var(--muted)]" aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}>
              {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
            <button type="button" onClick={() => onCopy(item.password)} className="rounded p-0.5 hover:bg-[var(--muted)]" aria-label="비밀번호 복사">
              <Copy className="size-3.5" />
            </button>
          </span>
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="size-8" onClick={onEdit} aria-label="수정">
          <Pencil className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8 text-red-600 hover:text-red-700" onClick={onDelete} aria-label="삭제">
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
