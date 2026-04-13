import * as cheerio from "cheerio";
import type { BlogConvertRequest, BlogConvertResult } from "@/types/blogConvert";
import { OG_WRAP_CSS } from "@/constants/blogCssTemplate";

export function convertForPlatform(req: BlogConvertRequest): BlogConvertResult {
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

  // class, id 속성 제거
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

  // info-box, warn → 텍스트 박스
  $(".info-box, [class*='info']").each((_: number, el: any) => {
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

// ── Medium 변환 (HTML → Markdown) ──
function convertToMedium(req: BlogConvertRequest): BlogConvertResult {
  const $ = cheerio.load(req.content ?? "", {});

  // style, script 제거
  $("style, script, link").remove();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function htmlToMd(el: any): string {
    let md = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    el.contents().each((_: number, node: any) => {
      if (node.type === "text") {
        md += $(node).text();
        return;
      }
      const $n = $(node);
      const tag = (node.tagName ?? "").toLowerCase();

      switch (tag) {
        case "h1": md += `\n# ${$n.text().trim()}\n\n`; break;
        case "h2": md += `\n## ${$n.text().trim()}\n\n`; break;
        case "h3": md += `\n### ${$n.text().trim()}\n\n`; break;
        case "p": {
          const cls = $n.attr("class") ?? "";
          if (cls.includes("preview") || cls.includes("source")) {
            md += `*${$n.text().trim()}*\n\n`;
          } else {
            md += `${htmlToMd($n).trim()}\n\n`;
          }
          break;
        }
        case "br": md += "\n"; break;
        case "strong": case "b": md += `**${$n.text().trim()}**`; break;
        case "em": case "i": md += `*${$n.text().trim()}*`; break;
        case "a": md += `[${$n.text().trim()}](${$n.attr("href") ?? ""})`; break;
        case "img": md += `![${$n.attr("alt") ?? ""}](${$n.attr("src") ?? ""})\n\n`; break;
        case "blockquote": md += `> ${$n.text().trim()}\n\n`; break;
        case "ul":
          $n.children("li").each((_: number, li: any) => { md += `- ${$(li).text().trim()}\n`; });
          md += "\n"; break;
        case "ol":
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          $n.children("li").each((j: number, li: any) => { md += `${j + 1}. ${$(li).text().trim()}\n`; });
          md += "\n"; break;
        case "table": {
          const rows: string[][] = [];
          $n.find("tr").each((_: number, tr: any) => {
            const cells: string[] = [];
            $(tr).find("th, td").each((_: number, cell: any) => { cells.push($(cell).text().trim()); });
            rows.push(cells);
          });
          if (rows.length > 0) {
            md += "\n| " + rows[0].join(" | ") + " |\n";
            md += "| " + rows[0].map(() => "---").join(" | ") + " |\n";
            for (let r = 1; r < rows.length; r++) {
              md += "| " + rows[r].join(" | ") + " |\n";
            }
            md += "\n";
          }
          break;
        }
        case "hr": md += "\n---\n\n"; break;
        case "div": {
          const cls = $n.attr("class") ?? "";
          if (cls.includes("answer-box")) {
            const a = $n.find(".a").text().trim();
            const detail = $n.find(".detail").text().trim();
            md += `\n> ${a}\n> ${detail}\n\n`;
          } else if (cls.includes("conclusion-box")) {
            const body = $n.find(".body").text().trim();
            const cta = $n.find(".cta").text().trim();
            md += `\n---\n\n**${body}**\n\n${cta}\n\n`;
          } else if (cls.includes("info-box")) {
            md += `\n> ${$n.text().trim()}\n\n`;
          } else if (cls.includes("warn")) {
            md += `\n> ⚠️ ${$n.text().trim()}\n\n`;
          } else if (cls.includes("stat-row")) {
            $n.find(".stat-box").each((_: number, sb: any) => {
              const num = $(sb).find(".num").text().trim();
              const lbl = $(sb).find(".lbl").text().trim();
              md += `- **${num}** ${lbl}\n`;
            });
            md += "\n";
          } else if (cls.includes("faq-item")) {
            const q = $n.find(".faq-q").text().trim();
            const a = $n.find(".faq-a").text().trim();
            md += `\n### ${q}\n\n${a}\n\n`;
          } else if (cls.includes("disclaimer")) {
            md += `\n---\n\n*${$n.text().trim()}*\n\n`;
          } else {
            md += htmlToMd($n);
          }
          break;
        }
        default: md += htmlToMd($n); break;
      }
    });
    return md;
  }

  let markdown = `# ${req.title ?? ""}\n\n`;
  if (req.meta_description) {
    markdown += `> ${req.meta_description}\n\n`;
  }
  markdown += htmlToMd($.root());

  // FAQ가 본문에 없으면 추가
  if (req.faq && req.faq.length > 0 && !markdown.includes("자주 묻는 질문")) {
    markdown += "\n## Frequently Asked Questions\n\n";
    for (const f of req.faq) {
      markdown += `### ${f.q}\n\n${f.a}\n\n`;
    }
  }

  markdown = markdown.replace(/\n{3,}/g, "\n\n").trim();

  return {
    converted_content: markdown,
    platform_meta: { subtitle: req.meta_description ?? "" },
  };
}
