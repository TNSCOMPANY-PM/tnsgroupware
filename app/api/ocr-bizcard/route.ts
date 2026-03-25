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
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `이 사업자등록증 이미지에서 다음 정보를 추출해서 JSON으로만 응답하세요. 없는 항목은 빈 문자열로:
{
  "name": "상호(법인명)",
  "business_number": "사업자등록번호 (XXX-XX-XXXXX 형식)",
  "representative": "대표자명",
  "address": "사업장 소재지",
  "business_type": "업태",
  "business_item": "종목"
}
JSON 외 다른 텍스트 없이 JSON만 응답하세요.`,
          },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" },
          },
        ],
      },
    ],
    max_tokens: 500,
  });

  const text = res.choices[0]?.message?.content ?? "";
  try {
    const json = JSON.parse(text.replace(/```json|```/g, "").trim());
    return NextResponse.json(json);
  } catch {
    return NextResponse.json({ error: "파싱 실패", raw: text }, { status: 500 });
  }
}
