// Tistory: <article> + 인라인 style 허용, class 금지, <script>/<link>/<style> 금지
export function prepareForTistory(html: string): string {
  let out = html;
  out = out.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style\b[\s\S]*?<\/style>/gi, "");
  out = out.replace(/\s+class="[^"]*"/g, "");
  out = out.replace(/\s+id="[^"]*"/g, "");
  if (!/<article[\s>]/i.test(out)) {
    out = `<article>${out}</article>`;
  }
  return out.trim();
}
