/**
 * v4 — geo_brands typeahead. id / name / ftc_brand_id 만 반환.
 */

import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function GET(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 50);

  const supabase = createAdminClient();
  let query = supabase.from("geo_brands").select("id, name, ftc_brand_id").limit(limit);
  if (q.length > 0) {
    query = query.ilike("name", `%${q}%`);
  } else {
    query = query.order("name");
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
