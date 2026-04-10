import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { convertForPlatform } from "@/utils/blogConverter";
import type { BlogConvertRequest } from "@/types/blogConvert";

export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body: BlogConvertRequest = await request.json();

  if (!body.content?.trim() || !body.target) {
    return NextResponse.json({ error: "content, target 필수" }, { status: 400 });
  }

  try {
    const result = convertForPlatform(body);
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "변환 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
