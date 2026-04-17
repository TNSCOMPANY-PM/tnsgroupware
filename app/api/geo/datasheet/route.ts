import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import { renderDatasheetHtml, renderCompositeHtml } from "@/utils/datasheetBuilder";
import type { DatasheetInput } from "@/utils/datasheetBuilder";
import {
  generateDS01,
  generateDS02,
  generateDS03,
  generateDS04,
  generateDS05,
  generateDS06,
  generateDS07,
  generateDS08,
  generateDS09,
  generateDS10,
  generateDS11,
  generateDS12,
  generateDS13,
  generateDS14,
  generateDS15,
  generateDS16,
  generateDS17,
  generateDS18,
  generateDS19,
  generateDS20,
  generateDS21,
  generateDS22,
  generateDS23,
  generateDS24,
  generateDS25,
  generateDS26,
  generateDS27,
  generateDS28,
  generateDS29,
  generateDS30,
} from "@/utils/dsGenerators";

export const maxDuration = 60;

/* ── 단일 DS 생성 ── */
async function generateOne(
  dsType: string,
  opts: { industry?: string; region?: string; brand?: string; ym?: string },
): Promise<DatasheetInput> {
  const { industry, region, brand, ym } = opts;

  switch (dsType) {
    case "DS-01":
      if (!industry) throw new Error("industry 필수 (DS-01)");
      return generateDS01(industry);
    case "DS-02":
      if (!industry) throw new Error("industry 필수 (DS-02)");
      return generateDS02(industry);
    case "DS-03":
      if (!industry) throw new Error("industry 필수 (DS-03)");
      return generateDS03(industry);
    case "DS-04":
      if (!industry || !region) throw new Error("industry, region 필수 (DS-04)");
      return generateDS04(industry, region);
    case "DS-05":
      if (!industry || !region) throw new Error("industry, region 필수 (DS-05)");
      return generateDS05(industry, region);
    case "DS-06":
      if (!industry) throw new Error("industry 필수 (DS-06)");
      return generateDS06(industry);
    case "DS-07":
      if (!industry) throw new Error("industry 필수 (DS-07)");
      return generateDS07(industry);
    case "DS-08":
      if (!industry) throw new Error("industry 필수 (DS-08)");
      return generateDS08(industry);
    case "DS-09":
      if (!brand) throw new Error("brand 필수 (DS-09)");
      return generateDS09(brand);
    case "DS-10":
      if (!brand) throw new Error("brand 필수 (DS-10)");
      return generateDS10(brand);
    case "DS-11":
      if (!brand) throw new Error("brand 필수 (DS-11)");
      return generateDS11(brand);
    case "DS-12":
      return generateDS12();
    case "DS-13":
      return generateDS13();
    case "DS-14":
      return generateDS14();
    case "DS-15":
      if (!industry) throw new Error("industry 필수 (DS-15)");
      return generateDS15(industry, ym ?? "");
    case "DS-16":
      if (!industry) throw new Error("industry 필수 (DS-16)");
      return generateDS16(industry, ym ?? "");
    case "DS-17":
      if (!region) throw new Error("region 필수 (DS-17)");
      return generateDS17(region);
    case "DS-18":
      if (!industry || !region) throw new Error("industry, region 필수 (DS-18)");
      return generateDS18(industry, region);
    case "DS-19":
      if (!industry || !region) throw new Error("industry, region 필수 (DS-19)");
      return generateDS19(industry, region);
    case "DS-20":
      if (!region) throw new Error("region 필수 (DS-20)");
      return generateDS20(region);
    case "DS-21":
      if (!brand) throw new Error("brand 필수 (DS-21)");
      return generateDS21(brand);
    case "DS-22":
      return generateDS22();
    case "DS-23":
      return generateDS23();
    case "DS-24":
      if (!brand) throw new Error("brand 필수 (DS-24)");
      return generateDS24(brand);
    case "DS-25":
      return generateDS25();
    case "DS-26":
      return generateDS26(brand);
    case "DS-27":
      if (!industry) throw new Error("industry 필수 (DS-27)");
      return generateDS27(industry);
    case "DS-28":
      return generateDS28(ym ?? "");
    case "DS-29":
      if (!industry) throw new Error("industry 필수 (DS-29)");
      return generateDS29(industry);
    case "DS-30":
      if (!industry) throw new Error("industry 필수 (DS-30)");
      return generateDS30(industry);
    default:
      throw new Error(`${dsType} 은 지원하지 않는 타입입니다.`);
  }
}

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = (await req.json()) as {
    ds_type?: string;
    ds_types?: string[];
    industry?: string;
    region?: string;
    brand?: string;
    ym?: string;
  };

  /* 하위 호환: ds_type 단일 → ds_types 배열 */
  const dsTypes: string[] =
    body.ds_types ?? (body.ds_type ? [body.ds_type] : []);
  if (dsTypes.length === 0) {
    return NextResponse.json(
      { error: "ds_type 또는 ds_types 필수" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const posts: { id: string; title: string; html: string }[] = [];
  const allInputs: DatasheetInput[] = [];

  for (const dsType of dsTypes) {
    try {
      const input = await generateOne(dsType, {
        industry: body.industry,
        region: body.region,
        brand: body.brand,
        ym: body.ym,
      });

      allInputs.push(input);
      const html = renderDatasheetHtml(input);

      const { data, error } = await supabase
        .from("frandoor_blog_drafts")
        .insert({
          content_type: "datasheet",
          channel: "frandoor",
          title: input.title,
          content: html,
          status: "draft",
          meta: {
            ds_type: dsType,
            combo: dsTypes.length > 1 ? dsTypes : undefined,
            industry: body.industry ?? null,
            region: body.region ?? null,
            brand: body.brand ?? null,
            ym: body.ym ?? null,
            base_date: input.baseDate,
          },
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: `${dsType}: ${error.message}` },
          { status: 500 },
        );
      }

      posts.push({ id: data?.id, title: input.title, html });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : `${dsType} 데이터 조회 실패`;
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  /* 단일: 기존 형식 유지, 복수: posts 배열 + 합성 HTML */
  if (posts.length === 1) {
    return NextResponse.json({ ok: true, post: posts[0] });
  }

  /* 복수 DS → 합성 HTML도 별도 draft로 저장 */
  const compositeHtml = renderCompositeHtml(allInputs);
  const compositeTitle = allInputs
    .map((i) => i.dsType)
    .join(" + ") + " 종합";

  const { data: compositeData } = await supabase
    .from("frandoor_blog_drafts")
    .insert({
      content_type: "datasheet",
      channel: "frandoor",
      title: compositeTitle,
      content: compositeHtml,
      status: "draft",
      meta: {
        ds_type: "composite",
        combo: dsTypes,
        industry: body.industry ?? null,
        region: body.region ?? null,
        brand: body.brand ?? null,
        ym: body.ym ?? null,
        base_date: allInputs[0]?.baseDate ?? "",
      },
    })
    .select()
    .single();

  return NextResponse.json({
    ok: true,
    posts,
    composite: {
      id: compositeData?.id ?? null,
      title: compositeTitle,
      html: compositeHtml,
    },
  });
}
