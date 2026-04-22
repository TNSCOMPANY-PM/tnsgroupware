const SITE_ORIGIN = "https://frandoor.co.kr";

export function ensureBacklink(html: string, canonicalUrl: string, anchorLabel: string): string {
  const fullUrl = canonicalUrl.startsWith("http") ? canonicalUrl : `${SITE_ORIGIN}${canonicalUrl}`;
  const hasBacklink = html.includes(fullUrl) || html.includes(canonicalUrl);
  const hasCanonical = /<link\s+rel=["']canonical["']/i.test(html);

  const linkTag = `<link rel="canonical" href="${fullUrl}">`;
  const anchor = `<p class="canonical-anchor">${anchorLabel} — <a href="${fullUrl}" rel="canonical">${fullUrl}</a></p>`;

  let out = html;
  if (!hasCanonical) out = `${linkTag}\n${out}`;
  if (!hasBacklink) out = `${out}\n${anchor}`;
  return out;
}

export function canonicalFullUrl(path: string): string {
  return path.startsWith("http") ? path : `${SITE_ORIGIN}${path}`;
}
