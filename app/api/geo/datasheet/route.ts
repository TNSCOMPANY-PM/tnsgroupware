import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import { renderDatasheetHtml } from "@/utils/datasheetBuilder";
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
} from "@/utils/dsGenerators";

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await req.json() as {
    ds_type: string;
    industry?: string;
    region?: string;
    brand?: string;
    year?: string;
    ym?: string;
  };

  if (!body.ds_type) {
    return NextResponse.json({ error: "ds_type 필수" }, { status: 400 });
  }

  let input: DatasheetInput;

  try {
    switch (body.ds_type) {
      case "DS-01":
        if (!body.industry) return NextResponse.json({ error: "industry 필수" }, { status: 400 });
        input = await generateDS01(body.industry);
        break;
      case "DS-02":
        if (!body.industry) return NextResponse.json({ error: "industry 필수" }, { status: 400 });
        input = await generateDS02(body.industry);
        break;
      case "DS-03":
        if (!body.industry) return NextResponse.json({ error: "industry 필수" }, { status: 400 });
        input = await generateDS03(body.industry);
        break;
      case "DS-04":
        if (!body.industry || !body.region) return NextResponse.json({ error: "industry, region 필수" }, { status: 400 });
        input = await generateDS04(body.industry, body.region);
        break;
      case "DS-05":
        if (!body.industry || !body.region) return NextResponse.json({ error: "industry, region 필수" }, { status: 400 });
        input = await generateDS05(body.industry, body.region);
        break;
      case "DS-06":
        if (!body.industry) return NextResponse.json({ error: "industry 필수" }, { status: 400 });
        input = await generateDS06(body.industry);
        break;
      case "DS-07":
        if (!body.industry) return NextResponse.json({ error: "industry 필수" }, { status: 400 });
        input = await generateDS07(body.industry);
        break;
      case "DS-08":
        if (!body.industry) return NextResponse.json({ error: "industry 필수" }, { status: 400 });
        input = await generateDS08(body.industry);
        break;
      case "DS-09":
        if (!body.brand) return NextResponse.json({ error: "brand 필수" }, { status: 400 });
        input = await generateDS09(body.brand);
        break;
      case "DS-10":
        if (!body.brand) return NextResponse.json({ error: "brand 필수" }, { status: 400 });
        input = await generateDS10(body.brand);
        break;
      case "DS-11":
        if (!body.brand) return NextResponse.json({ error: "brand 필수" }, { status: 400 });
        input = await generateDS11(body.brand);
        break;
      case "DS-12":
        input = generateDS12();
        break;
      case "DS-13":
        input = generateDS13();
        break;
      case "DS-14":
        input = generateDS14();
        break;
      case "DS-15":
        if (!body.industry) return NextResponse.json({ error: "industry 필수" }, { status: 400 });
        input = await generateDS15(body.industry, body.ym ?? "");
        break;
      case "DS-16":
        if (!body.industry) return NextResponse.json({ error: "industry 필수" }, { status: 400 });
        input = await generateDS16(body.industry, body.ym ?? "");
        break;
      default:
        return NextResponse.json({ error: `${body.ds_type} 은 지원하지 않는 타입입니다.` }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "데이터 조회 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const html = renderDatasheetHtml(input);

  // Supabase 저장
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("frandoor_blog_drafts")
    .insert({
      content_type: "datasheet",
      channel: "frandoor",
      title: input.title,
      content: html,
      status: "draft",
      meta: {
        ds_type: body.ds_type,
        industry: body.industry ?? null,
        region: body.region ?? null,
        brand: body.brand ?? null,
        ym: body.ym ?? null,
        base_date: input.baseDate,
      },
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    post: { id: data?.id, title: input.title, html },
  });
}
