/**
 * PR045 — D3 본문에 삽입할 HTML 박스 5종.
 * 반환은 markdown-with-HTML 문자열 (Tistory·Naver 양쪽 호환).
 *
 * 모드:
 *   - "class" (기본): og-wrap CSS 클래스 사용 — Tistory·웹 발행 권장
 *   - "inline":      <style> 차단 환경 (Naver 등) 위한 inline-style fallback
 */

export type BlockMode = "class" | "inline";

export type AnswerBoxInput = {
  question_label?: string;
  answer_text: string;
  detail?: string | null;
  mode?: BlockMode;
};

export type StatItem = {
  num: string;
  lbl: string;
};

export type StatRowInput = {
  items: StatItem[];
  mode?: BlockMode;
};

export type ConclusionBoxInput = {
  title?: string;
  body: string;
  cta?: { label: string; href?: string; phone?: string } | null;
  mode?: BlockMode;
};

export type FormulaItem = { metric: string; formula: string };
export type FormulaBoxInput = {
  title?: string;
  items: FormulaItem[];
  mode?: BlockMode;
};

const STYLE = {
  answer: {
    box: "background:#f0f6ff;border-radius:10px;padding:18px 20px;margin:16px 0;border:1px solid #d9e6f7;",
    q: "font-size:13px;font-weight:600;color:#3a6fb5;margin-bottom:6px;letter-spacing:0.02em;",
    a: "font-size:16px;font-weight:600;color:#142a44;line-height:1.5;",
    detail: "font-size:14px;color:#3a4a60;margin-top:8px;line-height:1.6;",
  },
  stat: {
    row: "display:flex;flex-wrap:wrap;gap:12px;margin:16px 0;",
    box: "flex:1 1 140px;background:#fafbfc;border:1px solid #e3e8ef;border-radius:8px;padding:14px 16px;text-align:center;",
    num: "font-size:18px;font-weight:700;color:#142a44;",
    lbl: "font-size:12px;color:#5a6b80;margin-top:4px;",
  },
  info: {
    box: "background:#f0f6ff;border-left:4px solid #3a6fb5;padding:14px 18px;margin:14px 0;border-radius:6px;font-size:14px;color:#142a44;line-height:1.6;",
  },
  warn: {
    box: "background:#fff3f3;border-left:4px solid #e24b4a;padding:14px 18px;margin:14px 0;border-radius:6px;font-size:14px;color:#4a1414;line-height:1.6;",
  },
  conclusion: {
    box: "background:#1a3a5c;color:#ffffff;border-radius:10px;padding:22px 24px;margin:20px 0;",
    title: "font-size:14px;font-weight:600;color:#a8c4e8;letter-spacing:0.04em;margin-bottom:8px;",
    body: "font-size:15px;line-height:1.7;color:#ffffff;",
    cta: "margin-top:14px;font-size:13px;color:#a8c4e8;",
  },
};

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function classOrInline(
  mode: BlockMode | undefined,
  cls: string,
  styleStr: string,
): string {
  if (mode === "inline") return `style="${styleStr}"`;
  return `class="${cls}"`;
}

export function answerBox(input: AnswerBoxInput): string {
  const mode = input.mode ?? "class";
  const q = input.question_label ?? "결론부터";
  const a = input.answer_text.trim();
  const d = input.detail?.trim() || "";
  const wrap = classOrInline(mode, "answer-box", STYLE.answer.box);
  const qa = classOrInline(mode, "q", STYLE.answer.q);
  const aa = classOrInline(mode, "a", STYLE.answer.a);
  const da = classOrInline(mode, "detail", STYLE.answer.detail);
  const detailHtml = d ? `<div ${da}>${escapeText(d)}</div>` : "";
  return `<div ${wrap}><div ${qa}>${escapeText(q)}</div><div ${aa}>${escapeText(a)}</div>${detailHtml}</div>`;
}

export function statRow(input: StatRowInput): string {
  const mode = input.mode ?? "class";
  const items = input.items.slice(0, 4);
  if (items.length === 0) return "";
  const row = classOrInline(mode, "stat-row", STYLE.stat.row);
  const box = classOrInline(mode, "stat-box", STYLE.stat.box);
  const num = classOrInline(mode, "num", STYLE.stat.num);
  const lbl = classOrInline(mode, "lbl", STYLE.stat.lbl);
  const cells = items
    .map(
      (it) =>
        `<div ${box}><div ${num}>${escapeText(it.num)}</div><div ${lbl}>${escapeText(it.lbl)}</div></div>`,
    )
    .join("");
  return `<div ${row}>${cells}</div>`;
}

export function infoBox(text: string, mode: BlockMode = "class"): string {
  const wrap = classOrInline(mode, "info-box", STYLE.info.box);
  return `<div ${wrap}>${escapeText(text.trim())}</div>`;
}

export function warnBox(text: string, mode: BlockMode = "class"): string {
  const wrap = classOrInline(mode, "warn", STYLE.warn.box);
  return `<div ${wrap}>${escapeText(text.trim())}</div>`;
}

function isHomepageHrefAllowed(href: string, allowedDomains: string[]): boolean {
  try {
    const url = new URL(href);
    return allowedDomains.some(
      (d) => url.hostname === d || url.hostname.endsWith(`.${d}`),
    );
  } catch {
    return false;
  }
}

export function conclusionBox(
  input: ConclusionBoxInput,
  opts: { allowedDomains?: string[] } = {},
): string {
  const mode = input.mode ?? "class";
  const title = input.title ?? "결론";
  const body = input.body.trim();
  const wrap = classOrInline(mode, "conclusion-box", STYLE.conclusion.box);
  const t = classOrInline(mode, "title", STYLE.conclusion.title);
  const b = classOrInline(mode, "body", STYLE.conclusion.body);
  const c = classOrInline(mode, "cta", STYLE.conclusion.cta);
  let ctaHtml = "";
  if (input.cta && input.cta.label) {
    const allowed = opts.allowedDomains ?? ["frandoor.co.kr"];
    const safeHref =
      input.cta.href && isHomepageHrefAllowed(input.cta.href, allowed) ? input.cta.href : null;
    const linkHtml = safeHref
      ? ` <a href="${escapeText(safeHref)}" rel="nofollow noopener" target="_blank">${escapeText(safeHref)}</a>`
      : "";
    const phoneHtml = input.cta.phone ? ` · ☎ ${escapeText(input.cta.phone)}` : "";
    ctaHtml = `<div ${c}>📌 ${escapeText(input.cta.label)} →${linkHtml}${phoneHtml}</div>`;
  }
  return `<div ${wrap}><div ${t}>${escapeText(title)}</div><div ${b}>${escapeText(body)}</div>${ctaHtml}</div>`;
}

export function formulaBox(input: FormulaBoxInput): string {
  const mode = input.mode ?? "class";
  const title = input.title ?? "이 글에서 계산한 값들 (frandoor 산출)";
  const items = input.items.filter((it) => it.metric && it.formula);
  if (items.length === 0) return "";
  const wrap =
    mode === "inline"
      ? `class="info-box formula-box" style="${STYLE.info.box}"`
      : `class="info-box formula-box"`;
  const list = items
    .map((it) => `<li><strong>${escapeText(it.metric)}</strong> = ${escapeText(it.formula)}</li>`)
    .join("");
  return `<div ${wrap}><strong>${escapeText(title)}</strong><ul>${list}</ul></div>`;
}

/** 발행 단계에서 본문 최상단에 1회 주입할 og-wrap CSS. <style> 가 차단되지 않는 채널용. */
export const OG_WRAP_CSS = `
.og-wrap .answer-box{${STYLE.answer.box}}
.og-wrap .answer-box .q{${STYLE.answer.q}}
.og-wrap .answer-box .a{${STYLE.answer.a}}
.og-wrap .answer-box .detail{${STYLE.answer.detail}}
.og-wrap .stat-row{${STYLE.stat.row}}
.og-wrap .stat-row .stat-box{${STYLE.stat.box}}
.og-wrap .stat-row .stat-box .num{${STYLE.stat.num}}
.og-wrap .stat-row .stat-box .lbl{${STYLE.stat.lbl}}
.og-wrap .info-box{${STYLE.info.box}}
.og-wrap .warn{${STYLE.warn.box}}
.og-wrap .conclusion-box{${STYLE.conclusion.box}}
.og-wrap .conclusion-box .title{${STYLE.conclusion.title}}
.og-wrap .conclusion-box .body{${STYLE.conclusion.body}}
.og-wrap .conclusion-box .cta{${STYLE.conclusion.cta}}
@media (max-width: 480px){.og-wrap .stat-row .stat-box{flex:1 1 calc(50% - 8px)}}
`.trim();
