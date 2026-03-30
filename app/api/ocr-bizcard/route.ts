import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mimeType = file.type || "image/jpeg";

  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "당신은 한국 사업자등록증 이미지에서 정보를 정확하게 추출하는 OCR 전문가입니다. 반드시 JSON 형식으로만 응답하세요.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `아래 한국 사업자등록증 이미지를 분석하여 다음 JSON 형식으로 정보를 추출하세요.

규칙:
- business_number는 반드시 XXX-XX-XXXXX 형식으로 하이픈 포함
- address는 도로명주소 또는 지번주소 전체를 그대로 (시/도 포함)
- business_type(업태)과 business_item(종목)이 여러 개면 쉼표로 구분
- 법인사업자는 representative에 대표이사명 기재
- 확인 불가능한 항목은 빈 문자열("")로

{
  "name": "상호 또는 법인명",
  "business_number": "사업자등록번호 (XXX-XX-XXXXX)",
  "representative": "대표자명",
  "address": "사업장 소재지 전체 주소",
  "business_type": "업태",
  "business_item": "종목"
}`,
          },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1000,
  });

  const text = res.choices[0]?.message?.content ?? "";
  try {
    const json = JSON.parse(text);
    return NextResponse.json(json);
  } catch {
    return NextResponse.json({ error: "파싱 실패", raw: text }, { status: 500 });
  }
}
