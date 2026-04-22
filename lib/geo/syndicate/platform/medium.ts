// Medium: HTML 기반이지만 풍부한 마크다운 변환 가능. blockquote·ul 활용 권장.
export function prepareForMedium(html: string): string {
  let out = html;
  out = out.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style\b[\s\S]*?<\/style>/gi, "");
  out = out.replace(/\s+class="[^"]*"/g, "");
  out = out.replace(/\s+id="[^"]*"/g, "");
  out = out.replace(/<article[^>]*>|<\/article>/gi, "");
  return out.trim();
}
