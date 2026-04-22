import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { fetchKeywordVolumes } from "@/utils/naverSearchAd";

export const runtime = "nodejs";
export const maxDuration = 300;

type AliasRow = { id: string; brand_id: string; alias: string; is_canonical: boolean };
type Anomaly = { brand_id: string; alias: string; kind: "mom_spike" | "alias_gap"; prev?: number; curr?: number; max?: number; min?: number };

function yearMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function notifySlack(text: string) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) { console.warn("[naver:slack] SLACK_WEBHOOK_URL missing — skip"); return; }
  try {
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  } catch { /* noop */ }
}

async function handler(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cron-secret");
    const bypass = req.headers.get("user-agent")?.includes("vercel-cron");
    if (!bypass && provided !== secret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const supa = createAdminClient();
  const ym = yearMonth();

  const { data: aliases, error: aErr } = await supa
    .from("geo_brand_alias")
    .select("id,brand_id,alias,is_canonical");
  if (aErr) return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });
  const aliasRows = (aliases ?? []) as AliasRow[];
  if (aliasRows.length === 0) {
    return NextResponse.json({ ok: false, error: "no aliases seeded" }, { status: 500 });
  }

  const warnings: string[] = [];
  const upsertRows: Array<{
    brand_id: string;
    alias_used: string;
    year_month: string;
    pc_volume: number;
    mobile_volume: number;
    total_volume: number;
    comp_index: string | null;
    measurement_floor: boolean;
    source: string;
  }> = [];

  const aliasByBrand = new Map<string, AliasRow[]>();
  for (const a of aliasRows) {
    if (!aliasByBrand.has(a.brand_id)) aliasByBrand.set(a.brand_id, []);
    aliasByBrand.get(a.brand_id)!.push(a);
  }

  const aliasResults = new Map<string, { pc: number; mobile: number; total: number; compIdx: string; floor: boolean }>();
  const all = aliasRows.map(a => a.alias);
  const BATCH = 5;
  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH);
    try {
      const vols = await fetchKeywordVolumes(batch);
      for (const v of vols) {
        aliasResults.set(v.keyword, {
          pc: v.pc, mobile: v.mobile, total: v.total,
          compIdx: v.compIdx,
          floor: v.total <= 10 && (v.pc === 5 || v.mobile === 5),
        });
      }
    } catch (e) {
      warnings.push(`batch ${i}-${i + batch.length} fail: ${e instanceof Error ? e.message : String(e)}`);
    }
    await new Promise(r => setTimeout(r, 250));
  }

  for (const [brandId, list] of aliasByBrand) {
    let best: { alias: string; pc: number; mobile: number; total: number; compIdx: string; floor: boolean } | null = null;
    for (const a of list) {
      const v = aliasResults.get(a.alias);
      if (!v) { warnings.push(`alias 누락: ${a.alias}`); continue; }
      if (!best || v.total > best.total) best = { alias: a.alias, ...v };
    }
    if (!best) continue;
    upsertRows.push({
      brand_id: brandId,
      alias_used: best.alias,
      year_month: ym,
      pc_volume: best.pc,
      mobile_volume: best.mobile,
      total_volume: best.total,
      comp_index: best.compIdx || null,
      measurement_floor: best.floor,
      source: "naver_searchad",
    });
  }

  let upserted = 0;
  const chunkSize = 200;
  for (let i = 0; i < upsertRows.length; i += chunkSize) {
    const chunk = upsertRows.slice(i, i + chunkSize);
    const { error } = await supa
      .from("geo_search_volume_monthly")
      .upsert(chunk, { onConflict: "brand_id,year_month" });
    if (error) warnings.push(`upsert chunk ${i}: ${error.message}`);
    else upserted += chunk.length;
  }

  const prevMonth = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return yearMonth(d);
  })();
  const brandIds = Array.from(aliasByBrand.keys());
  const { data: prev } = await supa
    .from("geo_search_volume_monthly")
    .select("brand_id,total_volume")
    .eq("year_month", prevMonth)
    .in("brand_id", brandIds);
  const prevByBrand = new Map<string, number>();
  for (const r of (prev ?? []) as Array<{ brand_id: string; total_volume: number }>) {
    prevByBrand.set(r.brand_id, r.total_volume);
  }

  const anomalies: Anomaly[] = [];
  for (const row of upsertRows) {
    const prevVal = prevByBrand.get(row.brand_id);
    if (prevVal && prevVal > 0) {
      const ratio = row.total_volume / prevVal;
      if (ratio >= 3 || ratio <= 1 / 3) {
        anomalies.push({ brand_id: row.brand_id, alias: row.alias_used, kind: "mom_spike", prev: prevVal, curr: row.total_volume });
      }
    }
  }
  for (const [brandId, list] of aliasByBrand) {
    const totals = list.map(a => aliasResults.get(a.alias)?.total ?? 0).filter(v => v > 0);
    if (totals.length >= 2) {
      const max = Math.max(...totals), min = Math.min(...totals);
      if (max / min >= 12) {
        anomalies.push({ brand_id: brandId, alias: "(n/a)", kind: "alias_gap", max, min });
      }
    }
  }

  const floorCount = upsertRows.filter(r => r.measurement_floor).length;
  console.log(`[naver:fetch:${ym}] ${upsertRows.length} alias, ${floorCount} floor, ${anomalies.length} anomalies`);

  if (anomalies.length > 0) {
    await notifySlack(`[naver:fetch:${ym}] anomalies ${anomalies.length}건 — ${JSON.stringify(anomalies.slice(0, 5))}`);
  }

  return NextResponse.json({
    ok: true,
    year_month: ym,
    fetched: upsertRows.length,
    floor: floorCount,
    anomalies: anomalies.length,
    upserted,
    warnings,
  });
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }
