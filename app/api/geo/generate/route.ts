import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { GeoInputSchema } from "@/lib/geo/schema";
import { generate } from "@/lib/geo";
import { NotImplementedError, type GeoOutput } from "@/lib/geo/types";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEPTH_TO_CONTENT_TYPE: Record<string, string> = {
  D0: "guide",
  D1: "compare",
  D2: "compare",
  D3: "brand",
};

function serializeDraft(out: GeoOutput): { title: string; content: string; faq: unknown[] } {
  const p = out.payload;
  if (p.kind === "markdown") {
    const title = typeof p.frontmatter?.title === "string" ? p.frontmatter.title : "";
    return { title, content: p.body ?? "", faq: [] };
  }
  if (p.kind === "industryDoc") {
    const body = (p.sections ?? []).map(s => `## ${s.heading}\n\n${s.body}`).join("\n\n");
    const title = p.sections?.[0]?.heading ?? "";
    return { title, content: body, faq: [] };
  }
  if (p.kind === "franchiseDoc") {
    const body = (p.sections ?? []).map(s => `## ${s.heading}\n\n${s.body}`).join("\n\n");
    const title = p.closure?.headline ?? p.sections?.[0]?.heading ?? "";
    return { title, content: body, faq: p.faq25 ?? [] };
  }
  return { title: "", content: JSON.stringify(out.payload, null, 2), faq: [] };
}

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const raw = await req.json().catch(() => null);
  const parsed = GeoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", detail: parsed.error.issues },
      { status: 422 },
    );
  }

  const depth = parsed.data.depth;
  const tiers = parsed.data.tiers ?? ["A", "B"];

  if (depth !== "D3" && tiers.includes("C")) {
    return NextResponse.json(
      { error: "C_TIER_D3_ONLY", message: "C급은 D3 전용" },
      { status: 400 },
    );
  }

  if (depth === "D3" && !parsed.data.brandId) {
    return NextResponse.json(
      { error: "D3_REQUIRES_BRAND_ID", message: "D3는 brandId 필수" },
      { status: 400 },
    );
  }

  try {
    const out = await generate(parsed.data);

    let draftId: string | null = null;
    let saveError: string | null = null;
    try {
      const supabase = createAdminClient();
      const serialized = serializeDraft(out);
      const brandId = depth === "D3" && "brandId" in parsed.data ? parsed.data.brandId : null;
      const { data, error } = await supabase
        .from("frandoor_blog_drafts")
        .insert({
          brand_id: brandId,
          channel: "frandoor",
          title: serialized.title,
          content: serialized.content,
          faq: serialized.faq,
          content_type: DEPTH_TO_CONTENT_TYPE[depth] ?? "external",
          status: "draft",
          target_date: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (error) {
        saveError = error.message;
      } else {
        draftId = data?.id ?? null;
      }
    } catch (e) {
      saveError = e instanceof Error ? e.message : String(e);
    }

    return NextResponse.json({ ...out, draftId, saveError });
  } catch (e) {
    if (e instanceof NotImplementedError) {
      return NextResponse.json({ error: "NOT_IMPLEMENTED", message: e.message }, { status: 501 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "GENERATE_FAILED", message: msg }, { status: 500 });
  }
}
