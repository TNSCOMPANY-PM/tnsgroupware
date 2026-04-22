// Tistory: <article> + 인라인 style 허용, class 금지. XSS 정화는 syndicate/index.ts 에서 선행.
export function prepareForTistory(html: string): string {
  let out = html;
  out = out.replace(/\s+class="[^"]*"/g, "");
  out = out.replace(/\s+id="[^"]*"/g, "");
  if (!/<article[\s>]/i.test(out)) {
    out = `<article>${out}</article>`;
  }
  return out.trim();
}
