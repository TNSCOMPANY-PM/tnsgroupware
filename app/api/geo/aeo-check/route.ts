import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

// 구글 Custom Search API 호출
async function searchGoogle(query: string): Promise<{ title: string; link: string; snippet: string }[]> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!apiKey || !cx) return [];

  try {
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=10`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []).map((item: { title?: string; link?: string; snippet?: string }) => ({
      title: item.title ?? "",
      link: item.link ?? "",
      snippet: item.snippet ?? "",
    }));
  } catch { return []; }
}

// 우리 도메인 목록
const OUR_DOMAINS = [
  "frandoor.co.kr",
  "frandoor",
  "50gimbab.frandoor.co.kr",
  "hanshinudong.frandoor.co.kr",
  "jangsajang.frandoor.co.kr",
];

// 네이버 검색 API 호출
async function searchNaver(query: string, type: "blog" | "webkr" = "blog"): Promise<{ title: string; link: string; description: string; bloggername?: string }[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  try {
    const res = await fetch(`https://openapi.naver.com/v1/search/${type}?query=${encodeURIComponent(query)}&display=10&sort=sim`, {
      headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []).map((item: { title?: string; link?: string; description?: string; bloggername?: string }) => ({
      title: (item.title ?? "").replace(/<[^>]*>/g, ""),
      link: item.link ?? "",
      description: (item.description ?? "").replace(/<[^>]*>/g, ""),
      bloggername: item.bloggername,
    }));
  } catch { return []; }
}

// GET: 키워드 목록 조회
export async function GET(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brand_id");
  const type = searchParams.get("type");
  if (!brandId) return NextResponse.json({ error: "brand_id required" }, { status: 400 });

  const supabase = createAdminClient();

  // 최근 체크 결과 조회
  if (type === "history") {
    const platform = searchParams.get("platform"); // "naver", "google", "aeo_google", "aeo_naver"
    let query = supabase.from("aeo_check_runs").select("*").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(5);
    if (platform) query = query.eq("platform", platform);
    const { data, error } = await query;
    if (error) return NextResponse.json([]);
    // results를 JSON 파싱
    return NextResponse.json((data ?? []).map(r => ({ ...r, results: typeof r.results === "string" ? JSON.parse(r.results) : r.results })));
  }

  // 키워드 목록 조회
  const { data, error } = await supabase
    .from("aeo_keywords")
    .select("*")
    .eq("brand_id", brandId)
    .order("sort_order");

  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return NextResponse.json([]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

// POST: 키워드 추가 또는 AEO 체크 실행
export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as {
    action: "add_keyword" | "run_check" | "check_single";
    brand_id: string;
    keyword?: string;
    platform?: "naver" | "google";
  };

  const supabase = createAdminClient();

  // 키워드 추가
  if (body.action === "add_keyword") {
    if (!body.keyword?.trim()) return NextResponse.json({ error: "keyword required" }, { status: 400 });

    const { data: existing } = await supabase
      .from("aeo_keywords")
      .select("id")
      .eq("brand_id", body.brand_id)
      .eq("keyword", body.keyword.trim());

    if (existing && existing.length > 0) return NextResponse.json({ error: "이미 등록된 키워드" }, { status: 400 });

    const { data: count } = await supabase
      .from("aeo_keywords")
      .select("id")
      .eq("brand_id", body.brand_id);

    const { data, error } = await supabase
      .from("aeo_keywords")
      .insert({ brand_id: body.brand_id, keyword: body.keyword.trim(), sort_order: (count?.length ?? 0) + 1 })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  // 단일 키워드 체크 (네이버 블로그 + 웹문서)
  if (body.action === "check_single") {
    if (!body.keyword?.trim()) return NextResponse.json({ error: "keyword required" }, { status: 400 });

    const { data: brand } = await supabase
      .from("geo_brands")
      .select("name, landing_url")
      .eq("id", body.brand_id)
      .single();

    const checkDomains = [...OUR_DOMAINS];
    if (brand?.landing_url) {
      const domain = brand.landing_url.replace(/https?:\/\//, "").replace(/\/$/, "");
      if (!checkDomains.includes(domain)) checkDomains.push(domain);
    }

    const keyword = body.keyword.trim();

    // 네이버 블로그 + 웹문서 검색
    const [blogResults, webResults] = await Promise.all([
      searchNaver(keyword, "blog"),
      searchNaver(keyword, "webkr"),
    ]);

    // 우리 콘텐츠 찾기
    const findOurs = (results: { link: string; title: string; description: string }[]) =>
      results.map((r, i) => ({
        ...r,
        rank: i + 1,
        is_ours: checkDomains.some(d => r.link.toLowerCase().includes(d.toLowerCase())),
      }));

    const blogRanked = findOurs(blogResults);
    const webRanked = findOurs(webResults);

    const ourBlogResults = blogRanked.filter(r => r.is_ours);
    const ourWebResults = webRanked.filter(r => r.is_ours);

    return NextResponse.json({
      keyword,
      naver: {
        blog: { results: blogRanked, our_count: ourBlogResults.length, our_results: ourBlogResults, total: blogResults.length },
        web: { results: webRanked, our_count: ourWebResults.length, our_results: ourWebResults, total: webResults.length },
        cited: ourBlogResults.length > 0 || ourWebResults.length > 0,
        best_rank: Math.min(
          ...[...ourBlogResults, ...ourWebResults].map(r => r.rank),
          999
        ),
      },
    });
  }

  // 전체 키워드 체크
  if (body.action === "run_check") {
    const { data: brand } = await supabase
      .from("geo_brands")
      .select("name, landing_url")
      .eq("id", body.brand_id)
      .single();

    if (!brand) return NextResponse.json({ error: "브랜드 없음" }, { status: 404 });

    const { data: keywords } = await supabase
      .from("aeo_keywords")
      .select("*")
      .eq("brand_id", body.brand_id)
      .order("sort_order");

    if (!keywords || keywords.length === 0) return NextResponse.json({ error: "등록된 키워드가 없습니다" }, { status: 400 });

    const checkDomains = [...OUR_DOMAINS];
    if (brand.landing_url) {
      const domain = brand.landing_url.replace(/https?:\/\//, "").replace(/\/$/, "");
      if (!checkDomains.includes(domain)) checkDomains.push(domain);
    }

    const platform = body.platform ?? "naver";
    type RankedResult = { title: string; link: string; rank: number; is_ours: boolean };
    const rankResults = (res: { link: string; title: string }[]): RankedResult[] =>
      res.map((r, i) => ({ title: r.title, link: r.link, rank: i + 1, is_ours: checkDomains.some(d => r.link.toLowerCase().includes(d.toLowerCase())) }));

    const results: {
      keyword: string; keyword_id: string; platform: string;
      blog_cited: boolean; web_cited: boolean; best_rank: number; our_urls: string[];
      blog_results: RankedResult[]; web_results: RankedResult[];
    }[] = [];

    for (const kw of keywords) {
      if (platform === "naver") {
        const [blogResults, webResults] = await Promise.all([
          searchNaver(kw.keyword, "blog"),
          searchNaver(kw.keyword, "webkr"),
        ]);
        const blogRanked = rankResults(blogResults);
        const webRanked = rankResults(webResults);
        const ourBlog = blogRanked.filter(r => r.is_ours);
        const ourWeb = webRanked.filter(r => r.is_ours);
        results.push({
          keyword: kw.keyword, keyword_id: kw.id, platform,
          blog_cited: ourBlog.length > 0, web_cited: ourWeb.length > 0,
          best_rank: Math.min(...[...ourBlog, ...ourWeb].map(r => r.rank), 999),
          our_urls: [...ourBlog, ...ourWeb].map(r => r.link),
          blog_results: blogRanked.slice(0, 5), web_results: webRanked.slice(0, 5),
        });
      } else {
        // 구글 Custom Search
        const googleResults = await searchGoogle(kw.keyword);
        const googleRanked = rankResults(googleResults);
        const ourGoogle = googleRanked.filter(r => r.is_ours);
        results.push({
          keyword: kw.keyword, keyword_id: kw.id, platform,
          blog_cited: false, web_cited: ourGoogle.length > 0,
          best_rank: Math.min(...ourGoogle.map(r => r.rank), 999),
          our_urls: ourGoogle.map(r => r.link),
          blog_results: [], web_results: googleRanked.slice(0, 10),
        });
      }
    }

    const citedCount = results.filter(r => r.blog_cited || r.web_cited).length;

    await supabase.from("aeo_check_runs").insert({
      brand_id: body.brand_id, platform,
      total_keywords: keywords.length, cited_count: citedCount,
      score: keywords.length > 0 ? Math.round((citedCount / keywords.length) * 100) : 0,
      results: JSON.stringify(results),
    });

    return NextResponse.json({
      brand_name: brand.name, platform,
      total_keywords: keywords.length, cited_count: citedCount,
      score: keywords.length > 0 ? Math.round((citedCount / keywords.length) * 100) : 0,
      results,
    });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}

// DELETE: 키워드 삭제
export async function DELETE(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from("aeo_keywords").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
