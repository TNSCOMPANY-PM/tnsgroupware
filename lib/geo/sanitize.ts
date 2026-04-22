import "server-only";
import sanitizeHtml from "sanitize-html";

// Sonnet 생성 HTML · DB payload 등 LLM/사용자 입력 신뢰할 수 없는 HTML 을 공통 allowlist 로 정화.
// 차단 대상: <iframe>·<object>·<embed>·<form>·<base>·<script>·<style>·<link>,
//           on* 이벤트 핸들러, javascript:·data: URL (img 는 data: 허용), srcdoc.
const BASE_ALLOW: sanitizeHtml.IOptions = {
  allowedTags: [
    "article", "section", "div", "span", "p", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "blockquote",
    "table", "thead", "tbody", "tr", "th", "td",
    "strong", "em", "b", "i", "u", "s", "code", "pre",
    "a", "img",
  ],
  allowedAttributes: {
    a: ["href", "title", "rel", "target"],
    img: ["src", "alt", "title", "width", "height"],
    "*": ["style"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  allowedStyles: {
    "*": {
      "text-align": [/^(left|right|center|justify)$/],
      "color": [/^#(0x)?[0-9a-f]+$/i, /^rgb\(.+\)$/i],
      "background-color": [/^#(0x)?[0-9a-f]+$/i],
      "font-weight": [/^(normal|bold|[1-9]00)$/],
    },
  },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
  },
};

export function sanitizeGeneratedHtml(raw: string): string {
  return sanitizeHtml(raw, BASE_ALLOW);
}
