// Medium: HTML 기반이지만 풍부한 마크다운 변환 가능. XSS 정화는 syndicate/index.ts 에서 선행.
export function prepareForMedium(html: string): string {
  let out = html;
  out = out.replace(/\s+class="[^"]*"/g, "");
  out = out.replace(/\s+id="[^"]*"/g, "");
  out = out.replace(/<article[^>]*>|<\/article>/gi, "");
  return out.trim();
}
