import * as cheerio from "cheerio";

export async function fetchFrandoorPage(url: string): Promise<{
  ok: boolean;
  title: string;
  textBlock: string;
  canonicalUrl: string;
}> {
  const empty = { ok: false, title: "", textBlock: "", canonicalUrl: "" };

  let parsed: URL;
  try { parsed = new URL(url); } catch { return empty; }
  if (!/(^|\.)frandoor\.co\.kr$/i.test(parsed.hostname)) return empty;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "frandoor-internal-bot/1.0" },
      cache: "no-store",
    });
    if (!res.ok) return empty;
    const html = await res.text();

    const $ = cheerio.load(html);
    const title = ($("title").first().text() || "").trim();
    const canonical = ($('link[rel="canonical"]').attr("href") || "").trim() || url;

    let $root = $("main").first();
    if ($root.length === 0) $root = $("article").first();
    if ($root.length === 0) $root = $("body").first();
    $root.find("script, style, noscript, nav, header, footer").remove();

    const textBlock = $root.text().replace(/\s+/g, " ").trim().slice(0, 6000);

    return { ok: true, title, textBlock, canonicalUrl: canonical };
  } catch {
    return empty;
  }
}
