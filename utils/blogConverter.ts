import * as cheerio from "cheerio";
import Anthropic from "@anthropic-ai/sdk";
import type { BlogConvertRequest, BlogConvertResult } from "@/types/blogConvert";
import { OG_WRAP_CSS } from "@/constants/blogCssTemplate";

export async function convertForPlatform(req: BlogConvertRequest): Promise<BlogConvertResult> {
  switch (req.target) {
    case "tistory": return convertToTistory(req);
    case "naver": return convertToNaver(req);
    case "medium": return convertToMedium(req);
    default: throw new Error(`지원하지 않는 플랫폼: ${req.target}`);
  }
}

// ── 티스토리 변환 ──
// 완성된 HTML: og-wrap CSS + JSON-LD + <div class="og-wrap">본문</div>
function convertToTistory(req: BlogConvertRequest): BlogConvertResult {
  const content = req.content ?? "";

  // JSON-LD 스키마
  let schemaScripts = "";
  if (req.schema_markup) {
    schemaScripts = req.schema_markup.includes("<script") ? req.schema_markup : `<script type="application/ld+json">${req.schema_markup}</script>`;
  }
  if (req.faq && req.faq.length > 0 && !schemaScripts.includes("FAQPage")) {
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: req.faq.map(f => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    };
    schemaScripts += `\n<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`;
  }

  // 본문이 이미 og-wrap으로 감싸져 있으면 그대로, 아니면 감쌈
  const wrappedContent = content.includes("og-wrap") ? content : `<div class="og-wrap">${content}</div>`;

  const fullHtml = `${OG_WRAP_CSS}\n\n${schemaScripts}\n\n${wrappedContent}`;

  return {
    converted_content: fullHtml,
    platform_meta: { visibility: 0 },
  };
}

// ── 네이버 변환 ──
// 스마트에디터 호환 단순 텍스트
function convertToNaver(req: BlogConvertRequest): BlogConvertResult {
  const $ = cheerio.load(req.content ?? "", {});

  // style, script, link 제거
  $("style, script, link").remove();

  // answer-box → 결론부터 텍스트
  let topText = "";
  const answerBox = $(".answer-box");
  if (answerBox.length) {
    const q = answerBox.find(".q").text().trim();
    const a = answerBox.find(".a").text().trim();
    const detail = answerBox.find(".detail").text().trim();
    topText = `[${q || "결론부터"}]\n${a}\n${detail}\n\n`;
    answerBox.remove();
  }

  // conclusion-box → 결론 텍스트
  let conclusionText = "";
  const conclusionBox = $(".conclusion-box");
  if (conclusionBox.length) {
    const body = conclusionBox.find(".body").text().trim();
    const cta = conclusionBox.find(".cta").text().trim();
    conclusionText = `\n[결론]\n${body}\n${cta}\n`;
    conclusionBox.remove();
  }

  // disclaimer → 면책 텍스트
  let disclaimerText = "";
  const disclaimer = $(".disclaimer");
  if (disclaimer.length) {
    disclaimerText = `\n${disclaimer.text().trim()}\n`;
    disclaimer.remove();
  }

  // class 기반 커스텀 컴포넌트를 먼저 텍스트 마커로 치환 (class 제거 전에 수행)
  // info-box, warn → 텍스트 박스
  $(".info-box, [class*='info-box']").each((_: number, el: any) => {
    $(el).replaceWith(`\n[참고] ${$(el).text().trim()}\n`);
  });
  $(".warn, [class*='warn']").each((_: number, el: any) => {
    $(el).replaceWith(`\n[주의] ${$(el).text().trim()}\n`);
  });

  // stat-row → 통계 텍스트
  $(".stat-row").each((_: number, el: any) => {
    const stats: string[] = [];
    $(el).find(".stat-box").each((_: number, sb: any) => {
      const num = $(sb).find(".num").text().trim();
      const lbl = $(sb).find(".lbl").text().trim();
      stats.push(`${lbl}: ${num}`);
    });
    $(el).replaceWith("\n" + stats.join(" | ") + "\n");
  });

  // source → 출처
  $(".source, p.source").each((_: number, el: any) => {
    $(el).replaceWith(`\n${$(el).text().trim()}\n`);
  });

  // class, id 속성 제거 (커스텀 컴포넌트 치환 이후)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $("*").each((_: number, el: any) => {
    const elem = $(el);
    elem.removeAttr("class").removeAttr("id").removeAttr("style");
  });

  // 본문 HTML → 순수 텍스트 추출 (모든 태그 제거)
  // h2 → ★ 소제목, h3 → ▶ 소제목, table → | 구분자 텍스트
  $("h2").each((_: number, el: any) => { $(el).replaceWith(`\n★ ${$(el).text().trim()}\n`); });
  $("h3").each((_: number, el: any) => { $(el).replaceWith(`\n▶ ${$(el).text().trim()}\n`); });

  // table → 텍스트 표
  $("table").each((_: number, el: any) => {
    const rows: string[] = [];
    $(el).find("tr").each((_: number, tr: any) => {
      const cells: string[] = [];
      $(tr).find("th, td").each((_: number, cell: any) => { cells.push($(cell).text().trim()); });
      rows.push(cells.join(" | "));
    });
    $(el).replaceWith("\n" + rows.join("\n") + "\n");
  });

  // 나머지 모든 태그에서 텍스트만 추출
  const bodyText = ($("body").text() || $.text() || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // FAQ → 단순 텍스트
  let faqText = "";
  if (req.faq && req.faq.length > 0) {
    faqText = "\n[자주 묻는 질문]\n" + req.faq.map(f => `Q. ${f.q}\nA. ${f.a}\n`).join("\n");
  }

  // 해시태그
  const hashtags = (req.keywords ?? []).map(k => `#${k.replace(/\s/g, "")}`).join(" ");

  const result = `${topText}${bodyText}\n${faqText}\n${conclusionText}\n${disclaimerText}\n${hashtags}`.trim();

  return {
    converted_content: result,
    platform_meta: {},
  };
}

// ── Medium 변환 (한국어 HTML → 영문 마크다운, Claude 번역) ──
async function convertToMedium(req: BlogConvertRequest): Promise<BlogConvertResult> {
  const $ = cheerio.load(req.content ?? "", {});
  $("style, script, link").remove();

  // HTML → 순수 한국어 텍스트 추출 (번역 입력용)
  const koreanText = ($("body").text() || $.text() || "").replace(/\n{3,}/g, "\n\n").trim();

  // FAQ 텍스트
  let faqText = "";
  if (req.faq && req.faq.length > 0) {
    faqText = "\n\n[FAQ]\n" + req.faq.map(f => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");
  }

  const fullKorean = `제목: ${req.title ?? ""}\n요약: ${req.meta_description ?? ""}\n\n${koreanText}${faqText}`;

  // Claude API로 영문 번역
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      converted_content: `<!-- ANTHROPIC_API_KEY not set — English translation unavailable -->\n\n${fullKorean}`,
      platform_meta: { subtitle: req.meta_description ?? "" },
    };
  }

  const anthropic = new Anthropic({ apiKey });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    messages: [{
      role: "user",
      content: `Translate the following Korean franchise business article to fluent, professional English for Medium publication.

Translation rules:
- ALL output must be in English. Not a single Korean sentence.
- 만원 amounts: show both ₩ and ~$USD (1 USD ≈ 1,350 KRW). Example: ₩65 million (~$48,000 USD)
- 가맹금 → Franchise Fee, 교육비 → Training Fee, 인테리어 → Interior/Renovation
- 보증금 → Deposit, 로열티 → Royalty, 실투자금 → Actual Cash Investment
- 공정거래위원회 → Korea Fair Trade Commission (KFTC)
- Keep all numbers exact. Don't round.
- Output as Markdown (## for h2, ### for h3, | for tables, **bold**, > blockquote).
- Natural, analytical English — not literal translation. Write for readers unfamiliar with Korean franchise market.

Korean article:
${fullKorean}`,
    }],
  });

  const english = msg.content[0]?.type === "text" ? msg.content[0].text : "";

  return {
    converted_content: english || `<!-- Translation failed -->\n\n${fullKorean}`,
    platform_meta: { subtitle: req.meta_description ?? "" },
  };
}
