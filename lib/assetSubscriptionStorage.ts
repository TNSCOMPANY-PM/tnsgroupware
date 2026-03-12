export type PaymentMethod = "대표님카드" | "한이사님카드" | "자동이체/무통장";

export interface SubscriptionRow {
  id: string;
  day: number;
  service: string;
  method: PaymentMethod;
  amount: number;
  note: string;
}

export interface SharedAccount {
  id: string;
  name: string;
  loginId: string;
  password: string;
}

export interface SharedAccountGroup {
  category: string;
  items: SharedAccount[];
}

export type EditLogAction = "add" | "edit" | "delete";

export interface EditLogEntry {
  id: string;
  at: string; // ISO
  action: EditLogAction;
  targetType: "subscription" | "account";
  targetName: string;
  details?: string;
}

const SUBSCRIPTION_STORAGE_KEY = "asset-subscription-rows";
const ACCOUNTS_STORAGE_KEY = "asset-shared-accounts";
const EDIT_LOG_STORAGE_KEY = "asset-edit-log";
const MAX_EDIT_LOG = 100;

const DEFAULT_SUBSCRIPTIONS: SubscriptionRow[] = [
  { id: "1", day: 5, service: "Adobe Creative Cloud", method: "대표님카드", amount: 658_000, note: "연간 결제 분할" },
  { id: "2", day: 10, service: "ChatGPT Team", method: "대표님카드", amount: 35_000, note: "" },
  { id: "3", day: 15, service: "Midjourney", method: "한이사님카드", amount: 22_000, note: "" },
  { id: "4", day: 25, service: "통신비 (인터넷/회선)", method: "자동이체/무통장", amount: 88_000, note: "통신사 자동이체" },
  { id: "5", day: 10, service: "정수기 렌탈", method: "자동이체/무통장", amount: 45_000, note: "" },
  { id: "6", day: 1, service: "캡스 보안", method: "자동이체/무통장", amount: 120_000, note: "월 정기" },
  { id: "7", day: 3, service: "AWS", method: "대표님카드", amount: 185_000, note: "사용량 기반" },
  { id: "8", day: 1, service: "Google Workspace", method: "한이사님카드", amount: 78_000, note: "10라이선스" },
  { id: "9", day: 20, service: "Freepik", method: "대표님카드", amount: 29_000, note: "" },
  { id: "10", day: 15, service: "쿠팡 로켓와우", method: "한이사님카드", amount: 4_900, note: "" },
  { id: "11", day: 5, service: "Slack", method: "대표님카드", amount: 15_000, note: "" },
  { id: "12", day: 1, service: "Notion", method: "한이사님카드", amount: 20_000, note: "팀 플랜" },
];

const DEFAULT_ACCOUNTS: SharedAccountGroup[] = [
  {
    category: "광고",
    items: [
      { id: "a1", name: "메타(Meta)", loginId: "ads@company.com", password: "meta_pw_2024!" },
      { id: "a2", name: "구글", loginId: "google-ads@company.com", password: "google_ads_#1" },
      { id: "a3", name: "네이버", loginId: "naver_sa", password: "nv_sa_secure" },
      { id: "a4", name: "카카오", loginId: "kakao_biz", password: "kakao_ad_99" },
      { id: "a5", name: "틱톡", loginId: "tiktok_ads@company.com", password: "tt_ads_pw" },
    ],
  },
  {
    category: "디자인/AI",
    items: [
      { id: "b1", name: "어도비(Adobe)", loginId: "creative@company.com", password: "adobe_cc_2024" },
      { id: "b2", name: "미리캔버스", loginId: "design@company.com", password: "canva_pw" },
      { id: "b3", name: "프리픽", loginId: "freepik@company.com", password: "freepik_!" },
      { id: "b4", name: "엔바토", loginId: "envato_team", password: "envato_2024" },
      { id: "b5", name: "망고보드", loginId: "mango@company.com", password: "mango_pw" },
      { id: "b6", name: "ChatGPT", loginId: "team@company.com", password: "chatgpt_team_pw" },
    ],
  },
  {
    category: "경영/행정",
    items: [
      { id: "c1", name: "세무(홈택스)", loginId: "htax_biz", password: "htax_secure" },
      { id: "c2", name: "4대보험", loginId: "insure@company.com", password: "ins_4d_pw" },
      { id: "c3", name: "기업/국민은행", loginId: "bank_corp", password: "bank_pw_enc" },
      { id: "c4", name: "노무사", loginId: "labor@law.kr", password: "labor_pw" },
      { id: "c5", name: "구글 워크스페이스", loginId: "admin@company.com", password: "gws_admin_pw" },
    ],
  },
  {
    category: "기타/호스팅",
    items: [
      { id: "d1", name: "카페24(Cafe24)", loginId: "cafe24_seller", password: "cafe24_pw" },
      { id: "d2", name: "가비아(Gabia)", loginId: "gabia_host", password: "gabia_secure" },
      { id: "d3", name: "아임웹(Imweb)", loginId: "imweb@company.com", password: "imweb_pw" },
    ],
  },
];

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadSubscriptions(): SubscriptionRow[] {
  if (typeof window === "undefined") return DEFAULT_SUBSCRIPTIONS;
  try {
    const raw = localStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
    if (!raw) return DEFAULT_SUBSCRIPTIONS;
    const parsed = JSON.parse(raw) as SubscriptionRow[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SUBSCRIPTIONS;
  } catch {
    return DEFAULT_SUBSCRIPTIONS;
  }
}

export function saveSubscriptions(rows: SubscriptionRow[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // ignore
  }
}

export function loadSharedAccounts(): SharedAccountGroup[] {
  if (typeof window === "undefined") return DEFAULT_ACCOUNTS;
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) return DEFAULT_ACCOUNTS;
    const parsed = JSON.parse(raw) as SharedAccountGroup[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ACCOUNTS;
  } catch {
    return DEFAULT_ACCOUNTS;
  }
}

export function saveSharedAccounts(groups: SharedAccountGroup[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(groups));
  } catch {
    // ignore
  }
}

export function loadEditLog(): EditLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(EDIT_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EditLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendEditLog(entry: Omit<EditLogEntry, "id">): void {
  const prev = loadEditLog();
  const newEntry: EditLogEntry = { ...entry, id: genId() };
  const next = [newEntry, ...prev].slice(0, MAX_EDIT_LOG);
  try {
    localStorage.setItem(EDIT_LOG_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function addEditLog(
  action: EditLogAction,
  targetType: "subscription" | "account",
  targetName: string,
  details?: string
): void {
  appendEditLog({
    at: new Date().toISOString(),
    action,
    targetType,
    targetName,
    details,
  });
}

export { genId, DEFAULT_SUBSCRIPTIONS, DEFAULT_ACCOUNTS };
