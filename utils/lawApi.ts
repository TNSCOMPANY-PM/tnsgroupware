/**
 * 국가법령정보 OpenAPI (law.go.kr) 래퍼.
 * 인증키: LAW_API_KEY (OC 값).
 *
 * 엔드포인트:
 *   - lawSearch.do : 법령 검색 (법령명/키워드)
 *   - lawService.do : 법령 상세 (조문 전체)
 */

function getOC(): string {
  const k = process.env.LAW_API_KEY;
  if (!k) throw new Error("[lawApi] LAW_API_KEY 미설정");
  return k;
}

async function fetchXml(url: string): Promise<string> {
  const r = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!r.ok) throw new Error(`[lawApi] HTTP ${r.status}`);
  return r.text();
}

// ─── 법령 검색 ──────────────────────────────
export type LawSearchItem = {
  lawSerial: string;    // 법령일련번호
  lawName: string;      // 법령명한글
  lawAbbr: string;      // 법령약칭명
  lawId: string;        // 법령ID
  promulgateDate: string;
  enforcementDate: string;
  detailLink: string;
};

export async function searchLaw(query: string): Promise<LawSearchItem[]> {
  const qs = new URLSearchParams({
    OC: getOC(),
    target: "law",
    type: "XML",
    query,
  });
  const xml = await fetchXml(`https://www.law.go.kr/DRF/lawSearch.do?${qs}`);

  const items: LawSearchItem[] = [];
  const re = /<law[^>]*>([\s\S]*?)<\/law>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const get = (tag: string) => {
      const r = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</${tag}>`);
      return m![1].match(r)?.[1]?.trim() ?? "";
    };
    items.push({
      lawSerial: get("법령일련번호"),
      lawName: get("법령명한글"),
      lawAbbr: get("법령약칭명"),
      lawId: get("법령ID"),
      promulgateDate: get("공포일자"),
      enforcementDate: get("시행일자"),
      detailLink: get("법령상세링크"),
    });
  }
  return items;
}

// ─── 법령 조문 상세 ──────────────────────────
export type LawArticle = {
  articleNo: string;      // 조문번호
  title: string;          // 조문제목
  content: string;        // 조문내용 (태그 제거)
  subItems: string[];     // 항/호/목 내용
};

export async function fetchLawArticles(lawSerial: string): Promise<LawArticle[]> {
  const qs = new URLSearchParams({
    OC: getOC(),
    target: "law",
    MST: lawSerial,
    type: "XML",
  });
  const xml = await fetchXml(`https://www.law.go.kr/DRF/lawService.do?${qs}`);

  const articles: LawArticle[] = [];
  const blockRe = /<조문단위[^>]*>([\s\S]*?)<\/조문단위>/g;
  let m: RegExpExecArray | null;

  while ((m = blockRe.exec(xml)) !== null) {
    const block = m[1];
    // 조문만 (전문/부칙 제외)
    if (!block.includes("<조문여부>조문</조문여부>")) continue;

    const getField = (tag: string) => {
      const r = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`);
      return block.match(r)?.[1]?.trim() ?? "";
    };

    const articleNo = getField("조문번호");
    const title = getField("조문제목");
    const content = getField("조문내용")
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // 항/호/목 내용 수집
    const subItems: string[] = [];
    const subRe = /<(?:항내용|호내용|목내용)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:항내용|호내용|목내용)>/g;
    let s: RegExpExecArray | null;
    while ((s = subRe.exec(block)) !== null) {
      const text = s[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/\s+/g, " ").trim();
      if (text) subItems.push(text);
    }

    articles.push({ articleNo, title, content, subItems });
  }

  return articles;
}

// ─── 가맹사업법 특화: 핵심 조항 추출 ──────────
const KEY_ARTICLES = [
  { no: "6", why: "정보공개서 등록" },
  { no: "7", why: "정보공개서 제공의무" },
  { no: "9", why: "허위·과장 정보제공 금지" },
  { no: "10", why: "가맹금 예치" },
  { no: "11", why: "가맹계약서 기재사항" },
  { no: "12", why: "불공정거래행위 금지" },
  { no: "12의2", why: "부당한 계약조건 금지" },
  { no: "12의3", why: "부당한 영업시간 구속 금지" },
  { no: "12의5", why: "점포환경개선 강요 금지" },
  { no: "14", why: "가맹계약 해지 제한" },
];

export function getKeyArticleNos(): typeof KEY_ARTICLES {
  return KEY_ARTICLES;
}

// 가맹사업법 법령일련번호 (현행)
export const FRANCHISE_LAW_SERIAL = "268283";
