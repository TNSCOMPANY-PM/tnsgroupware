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
// 스마트에디터는 class/id/<style> 은 제거하지만 inline style 속성은 보존.
// 따라서 class 기반 og-wrap 컴포넌트를 만나면 동일 디자인의 inline-style HTML 로 치환하고,
// 이미 inline style 로 짜여 있으면 그대로 통과시킨다.
function convertToNaver(req: BlogConvertRequest): BlogConvertResult {
  const $ = cheerio.load(req.content ?? "", {});

  // <style>, <script>, <link> 제거 (네이버가 어차피 제거)
  $("style, script, link").remove();

  // class 기반 컴포넌트 → inline style HTML 로 치환
  $(".answer-box").each((_: number, el: any) => {
    const $el = $(el);
    const q = $el.find(".q").html()?.trim() || "결론부터";
    const a = $el.find(".a").html()?.trim() || "";
    const detail = $el.find(".detail").html()?.trim() || "";
    $el.replaceWith(`<div style="background:#f3f6ff;border-left:4px solid #2563eb;border-radius:8px;padding:18px 20px;margin:0 0 24px 0">
  <div style="font-size:13px;font-weight:700;color:#2563eb;margin-bottom:8px">${q}</div>
  <div style="font-size:17px;font-weight:700;color:#111827;line-height:1.55">${a}</div>
  ${detail ? `<div style="font-size:14px;color:#4b5563;margin-top:10px;line-height:1.7">${detail}</div>` : ""}
</div>`);
  });

  $(".conclusion-box").each((_: number, el: any) => {
    const $el = $(el);
    const title = $el.find(".title").html()?.trim() || "결론";
    const body = $el.find(".body").html()?.trim() || "";
    const cta = $el.find(".cta").html()?.trim() || "";
    $el.replaceWith(`<div style="background:#111827;color:#fff;border-radius:10px;padding:20px 22px;margin:28px 0">
  <div style="font-size:16px;font-weight:800;margin-bottom:10px;color:#fbbf24">${title}</div>
  <div style="font-size:15px;line-height:1.8;color:#f3f4f6">${body}</div>
  ${cta ? `<div style="margin-top:14px;font-size:14px">${cta}</div>` : ""}
</div>`);
  });

  $(".disclaimer").each((_: number, el: any) => {
    const $el = $(el);
    $el.replaceWith(`<p style="font-size:12px;color:#9ca3af;line-height:1.7;margin:20px 0 0 0">${$el.html()?.trim() || ""}</p>`);
  });

  $(".info-box").each((_: number, el: any) => {
    const $el = $(el);
    $el.replaceWith(`<div style="background:#f0f9ff;border-left:3px solid #0ea5e9;padding:12px 14px;margin:14px 0;color:#075985;font-size:14px;line-height:1.7;border-radius:4px">${$el.html()?.trim() || ""}</div>`);
  });

  $(".warn").each((_: number, el: any) => {
    const $el = $(el);
    $el.replaceWith(`<div style="background:#fef2f2;border-left:3px solid #ef4444;padding:12px 14px;margin:14px 0;color:#991b1b;font-size:14px;line-height:1.7;border-radius:4px">${$el.html()?.trim() || ""}</div>`);
  });

  $(".stat-row").each((_: number, el: any) => {
    const $el = $(el);
    const boxes: string[] = [];
    $el.find(".stat-box").each((_: number, sb: any) => {
      const num = $(sb).find(".num").html()?.trim() || "";
      const lbl = $(sb).find(".lbl").html()?.trim() || "";
      boxes.push(`<div style="display:inline-block;min-width:30%;padding:14px 10px;margin:4px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;vertical-align:top"><div style="font-size:22px;font-weight:800;color:#2563eb">${num}</div><div style="font-size:12px;color:#6b7280;margin-top:4px">${lbl}</div></div>`);
    });
    $el.replaceWith(`<div style="margin:20px 0;text-align:center">${boxes.join("")}</div>`);
  });

  $(".faq-item").each((_: number, el: any) => {
    const $el = $(el);
    const q = $el.find(".faq-q").html()?.trim() || "";
    const a = $el.find(".faq-a").html()?.trim() || "";
    const source = $el.find(".faq-source").html()?.trim() || "";
    $el.replaceWith(`<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin:10px 0;background:#fff">
  <div style="font-weight:700;color:#111827;margin-bottom:8px">${q}</div>
  <div style="color:#374151;line-height:1.75;font-size:14px">${a}</div>
  ${source ? `<div style="font-size:12px;color:#9ca3af;margin-top:6px">${source}</div>` : ""}
</div>`);
  });

  $("p.source, .source").each((_: number, el: any) => {
    const $el = $(el);
    $el.replaceWith(`<p style="font-size:12px;color:#9ca3af;margin:8px 0 0 0">${$el.html()?.trim() || ""}</p>`);
  });

  // og-wrap 래퍼는 내용만 보존
  $(".og-wrap").each((_: number, el: any) => {
    const $el = $(el);
    $el.replaceWith($el.html() || "");
  });

  // 기본 H2 가 style 속성 없이 왔으면 티스토리 스타일 부여
  $("h2").each((_: number, el: any) => {
    if (!$(el).attr("style")) {
      $(el).attr("style", "font-size:22px;font-weight:800;color:#111827;margin:40px 0 16px 0;padding-bottom:8px;border-bottom:2px solid #111827");
    }
  });
  $("h3").each((_: number, el: any) => {
    if (!$(el).attr("style")) {
      $(el).attr("style", "font-size:18px;font-weight:700;color:#111827;margin:24px 0 10px 0");
    }
  });
  $("table").each((_: number, el: any) => {
    if (!$(el).attr("style")) {
      $(el).attr("style", "width:100%;border-collapse:collapse;margin:16px 0;font-size:14px");
    }
    $(el).find("th").each((_: number, th: any) => {
      if (!$(th).attr("style")) $(th).attr("style", "padding:10px 12px;border:1px solid #e5e7eb;text-align:left;font-weight:700;background:#f9fafb");
    });
    $(el).find("td").each((_: number, td: any) => {
      if (!$(td).attr("style")) $(td).attr("style", "padding:10px 12px;border:1px solid #e5e7eb");
    });
  });
  $("p").each((_: number, el: any) => {
    if (!$(el).attr("style")) {
      $(el).attr("style", "font-size:15px;line-height:1.85;color:#374151;margin:0 0 14px 0");
    }
  });

  // class, id 속성 제거 (inline style 은 보존)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $("*").each((_: number, el: any) => {
    $(el).removeAttr("class").removeAttr("id");
  });

  // FAQ (req.faq) 가 별도로 전달되고 본문에 faq-item 이 없었다면 inline 스타일로 추가
  let faqHtml = "";
  const hasFaqInBody = $("[style*='Q']").length > 0 || ($("body").text() || $.text() || "").includes("자주 묻는 질문");
  if (req.faq && req.faq.length > 0 && !hasFaqInBody) {
    faqHtml = `<h2 style="font-size:22px;font-weight:800;color:#111827;margin:40px 0 16px 0;padding-bottom:8px;border-bottom:2px solid #111827">자주 묻는 질문</h2>`;
    for (const f of req.faq) {
      faqHtml += `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin:10px 0;background:#fff">
  <div style="font-weight:700;color:#111827;margin-bottom:8px"><span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;background:#2563eb;color:#fff;border-radius:4px;font-size:12px;margin-right:8px">Q</span>${f.q}</div>
  <div style="color:#374151;line-height:1.75;font-size:14px">${f.a}</div>
</div>`;
    }
  }

  // 해시태그
  let hashtagsHtml = "";
  if ((req.keywords ?? []).length > 0) {
    const tags = (req.keywords ?? []).map(k => `#${k.replace(/\s/g, "")}`).join(" ");
    hashtagsHtml = `<p style="font-size:13px;color:#6b7280;margin-top:14px">${tags}</p>`;
  }

  // body 내부 HTML 추출 (cheerio 가 자동으로 감싼 <html><body> 제거)
  const bodyHtml = $("body").html() || $.html() || "";
  const result = `${bodyHtml}${faqHtml}${hashtagsHtml}`.replace(/\n{3,}/g, "\n\n").trim();

  return {
    converted_content: result,
    platform_meta: {},
  };
}

// ── Medium 변환 (한국어 HTML → 영문 HTML with inline styles, Claude 번역) ──
// Tistory 와 동일한 비주얼 디자인을 inline style 로 유지한 채 본문만 영문으로 번역.
async function convertToMedium(req: BlogConvertRequest): Promise<BlogConvertResult> {
  const $ = cheerio.load(req.content ?? "", {});
  $("style, script, link").remove();

  // class 기반 og-wrap 컴포넌트를 inline style HTML 로 먼저 치환 (네이버 변환과 동일 디자인 사전 적용)
  $(".answer-box").each((_: number, el: any) => {
    const $el = $(el);
    const q = $el.find(".q").html()?.trim() || "KEY TAKEAWAY";
    const a = $el.find(".a").html()?.trim() || "";
    const detail = $el.find(".detail").html()?.trim() || "";
    $el.replaceWith(`<div style="background:#f3f6ff;border-left:4px solid #2563eb;border-radius:8px;padding:18px 20px;margin:0 0 24px 0"><div style="font-size:13px;font-weight:700;color:#2563eb;margin-bottom:8px">${q}</div><div style="font-size:17px;font-weight:700;color:#111827;line-height:1.55">${a}</div>${detail ? `<div style="font-size:14px;color:#4b5563;margin-top:10px;line-height:1.7">${detail}</div>` : ""}</div>`);
  });
  $(".conclusion-box").each((_: number, el: any) => {
    const $el = $(el);
    const title = $el.find(".title").html()?.trim() || "Summary";
    const body = $el.find(".body").html()?.trim() || "";
    const cta = $el.find(".cta").html()?.trim() || "";
    $el.replaceWith(`<div style="background:#111827;color:#fff;border-radius:10px;padding:20px 22px;margin:28px 0"><div style="font-size:16px;font-weight:800;margin-bottom:10px;color:#fbbf24">${title}</div><div style="font-size:15px;line-height:1.8;color:#f3f4f6">${body}</div>${cta ? `<div style="margin-top:14px;font-size:14px">${cta}</div>` : ""}</div>`);
  });
  $(".disclaimer").each((_: number, el: any) => {
    const $el = $(el);
    $el.replaceWith(`<p style="font-size:12px;color:#9ca3af;line-height:1.7;margin:20px 0 0 0">${$el.html()?.trim() || ""}</p>`);
  });
  $(".info-box").each((_: number, el: any) => {
    const $el = $(el);
    $el.replaceWith(`<div style="background:#f0f9ff;border-left:3px solid #0ea5e9;padding:12px 14px;margin:14px 0;color:#075985;font-size:14px;line-height:1.7;border-radius:4px">${$el.html()?.trim() || ""}</div>`);
  });
  $(".warn").each((_: number, el: any) => {
    const $el = $(el);
    $el.replaceWith(`<div style="background:#fef2f2;border-left:3px solid #ef4444;padding:12px 14px;margin:14px 0;color:#991b1b;font-size:14px;line-height:1.7;border-radius:4px">${$el.html()?.trim() || ""}</div>`);
  });
  $(".stat-row").each((_: number, el: any) => {
    const $el = $(el);
    const boxes: string[] = [];
    $el.find(".stat-box").each((_: number, sb: any) => {
      const num = $(sb).find(".num").html()?.trim() || "";
      const lbl = $(sb).find(".lbl").html()?.trim() || "";
      boxes.push(`<div style="display:inline-block;min-width:30%;padding:14px 10px;margin:4px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;vertical-align:top"><div style="font-size:22px;font-weight:800;color:#2563eb">${num}</div><div style="font-size:12px;color:#6b7280;margin-top:4px">${lbl}</div></div>`);
    });
    $el.replaceWith(`<div style="margin:20px 0;text-align:center">${boxes.join("")}</div>`);
  });
  $(".faq-item").each((_: number, el: any) => {
    const $el = $(el);
    const q = $el.find(".faq-q").html()?.trim() || "";
    const a = $el.find(".faq-a").html()?.trim() || "";
    const source = $el.find(".faq-source").html()?.trim() || "";
    $el.replaceWith(`<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin:10px 0;background:#fff"><div style="font-weight:700;color:#111827;margin-bottom:8px">${q}</div><div style="color:#374151;line-height:1.75;font-size:14px">${a}</div>${source ? `<div style="font-size:12px;color:#9ca3af;margin-top:6px">${source}</div>` : ""}</div>`);
  });
  $(".og-wrap").each((_: number, el: any) => {
    const $el = $(el);
    $el.replaceWith($el.html() || "");
  });
  // 기본 태그에 inline style 주입
  $("h2").each((_: number, el: any) => {
    if (!$(el).attr("style")) $(el).attr("style", "font-size:22px;font-weight:800;color:#111827;margin:40px 0 16px 0;padding-bottom:8px;border-bottom:2px solid #111827");
  });
  $("h3").each((_: number, el: any) => {
    if (!$(el).attr("style")) $(el).attr("style", "font-size:18px;font-weight:700;color:#111827;margin:24px 0 10px 0");
  });
  $("table").each((_: number, el: any) => {
    if (!$(el).attr("style")) $(el).attr("style", "width:100%;border-collapse:collapse;margin:16px 0;font-size:14px");
    $(el).find("th").each((_: number, th: any) => {
      if (!$(th).attr("style")) $(th).attr("style", "padding:10px 12px;border:1px solid #e5e7eb;text-align:left;font-weight:700;background:#f9fafb");
    });
    $(el).find("td").each((_: number, td: any) => {
      if (!$(td).attr("style")) $(td).attr("style", "padding:10px 12px;border:1px solid #e5e7eb");
    });
  });
  $("p").each((_: number, el: any) => {
    if (!$(el).attr("style")) $(el).attr("style", "font-size:15px;line-height:1.85;color:#374151;margin:0 0 14px 0");
  });
  // class, id 제거 (inline style 은 유지)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $("*").each((_: number, el: any) => { $(el).removeAttr("class").removeAttr("id"); });

  const koreanInlineHtml = ($("body").html() || $.html() || "").trim();

  // FAQ 보강
  let faqHtml = "";
  if (req.faq && req.faq.length > 0 && !koreanInlineHtml.includes("자주 묻는 질문") && !koreanInlineHtml.toLowerCase().includes("faq")) {
    faqHtml = `<h2 style="font-size:22px;font-weight:800;color:#111827;margin:40px 0 16px 0;padding-bottom:8px;border-bottom:2px solid #111827">자주 묻는 질문</h2>`;
    for (const f of req.faq) {
      faqHtml += `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin:10px 0;background:#fff"><div style="font-weight:700;color:#111827;margin-bottom:8px">Q. ${f.q}</div><div style="color:#374151;line-height:1.75;font-size:14px">${f.a}</div></div>`;
    }
  }

  const fullKoreanHtml = `<h1 style="font-size:28px;font-weight:800;color:#111827;margin:0 0 8px 0">${req.title ?? ""}</h1><p style="font-size:14px;color:#6b7280;margin:0 0 24px 0">${req.meta_description ?? ""}</p>${koreanInlineHtml}${faqHtml}`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      converted_content: `<!-- ANTHROPIC_API_KEY not set — English translation unavailable -->\n\n${fullKoreanHtml}`,
      platform_meta: { subtitle: req.meta_description ?? "" },
    };
  }

  const anthropic = new Anthropic({ apiKey });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 12000,
    messages: [{
      role: "user",
      content: `Translate the following Korean franchise business article to fluent, professional English for Medium.

★★★ CRITICAL FORMAT RULES ★★★
- Output HTML ONLY. No markdown. No code fences. No explanatory prose before or after.
- PRESERVE EVERY HTML TAG AND INLINE style="..." ATTRIBUTE EXACTLY AS GIVEN. Do not remove, simplify, or re-style any tag.
- Translate ONLY the visible text nodes inside tags. Do not translate tag names, attributes, or style values.
- Keep the same DOM structure — same <div>, <h2>, <p>, <table>, <tr>, <td> nesting and order.

Translation rules:
- ALL visible text must be in English. Not a single Korean character in the output.
- 만원 amounts: show both ₩ and ~$USD (1 USD ≈ 1,350 KRW). Example: ₩65M (~$48,000)
- 가맹금 → Franchise Fee, 교육비 → Training Fee, 인테리어 → Interior/Renovation
- 보증금 → Deposit, 로열티 → Royalty, 실투자금 → Actual Cash Investment
- 공정거래위원회 → Korea Fair Trade Commission (KFTC)
- 결론부터 → KEY TAKEAWAY, 자주 묻는 질문 → Frequently Asked Questions
- Keep all numeric values exact. Don't round.
- Natural analytical English for readers unfamiliar with the Korean franchise market.

Korean HTML:
${fullKoreanHtml}`,
    }],
  });

  const english = msg.content[0]?.type === "text" ? msg.content[0].text : "";

  return {
    converted_content: english || `<!-- Translation failed -->\n\n${fullKoreanHtml}`,
    platform_meta: { subtitle: req.meta_description ?? "" },
  };
}
