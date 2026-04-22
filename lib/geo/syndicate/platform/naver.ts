// 네이버 스마트에디터: <script>/<style>/<link>/class/id 금지. style 최소화.
export function prepareForNaver(html: string): string {
  let out = html;
  out = out.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style\b[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<link\b[^>]*>/gi, "");
  out = out.replace(/\s+class="[^"]*"/g, "");
  out = out.replace(/\s+id="[^"]*"/g, "");
  // style 속성은 대부분 제거 (text-align 만 유지)
  out = out.replace(/\s+style="([^"]*)"/g, (_m, s: string) => {
    const keep = /(text-align\s*:\s*(left|right|center|justify))/i.exec(s);
    return keep ? ` style="${keep[1]}"` : "";
  });
  out = out.replace(/<article[^>]*>|<\/article>/gi, "");
  return out.trim();
}
