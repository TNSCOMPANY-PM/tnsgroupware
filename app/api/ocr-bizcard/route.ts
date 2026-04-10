import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "이미지 크기가 5MB를 초과합니다." }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mimeType = (file.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      temperature: 0,
      system: `당신은 한국 사업자등록증(사업자등록번호증) OCR 전문가입니다. 반드시 JSON 형식으로만 응답하세요.

## 핵심 규칙
1. 이미지에 보이는 텍스트를 한 글자씩 정확하게 읽어라. 추측하지 마라.
2. 한국어 고유명사(회사명, 건물명, 동/리 이름)는 특히 주의해서 읽어라. 비슷한 글자를 혼동하지 마라.
3. 사업자등록번호는 반드시 10자리 숫자(XXX-XX-XXXXX)여야 한다.
4. 주소는 시/도부터 상세주소까지 이미지에 보이는 그대로 기재한다.
5. 읽기 어려운 글자가 있으면 빈 문자열("")로 남겨라. 절대 추측하지 마라.
6. 법인명에 (주), (유), (사) 등 법인 형태가 있으면 반드시 포함한다.
7. 업태와 종목이 여러 개면 쉼표로 구분한다.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: base64 },
            },
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
}

## 올바른 추출 예시

예시 1:
{
  "name": "(주)티앤에스컴퍼니",
  "business_number": "455-86-00636",
  "representative": "김태정",
  "address": "서울특별시 강서구 공항대로 247, A동 12층 1209호(마곡동, 퀸즈파크나인)",
  "business_type": "서비스",
  "business_item": "홈페이지제작, 소프트웨어개발 및 공급, 광고대행업"
}

## 자주 발생하는 오인식 패턴 (반드시 주의)
- "컴퍼니"를 "캠피니"로 읽지 마라
- "공항대로"를 "금원로"로 읽지 마라
- "A동"을 "AS"로 읽지 마라
- "퀸즈파크나인"을 "공조마크나인"으로 읽지 마라
- "서비스"를 "임대"로 읽지 마라
- "홈페이지제작"을 "서버 추천정보서"로 읽지 마라
- 종목이 잘리지 않았는지 이미지 끝까지 확인하라`,
            },
          ],
        },
      ],
    });

    const text = res.content[0]?.type === "text" ? res.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "JSON 추출 실패", raw: text }, { status: 500 });
    }

    const json = JSON.parse(jsonMatch[0]) as {
      name?: string;
      business_number?: string;
      representative?: string;
      address?: string;
      business_type?: string;
      business_item?: string;
    };

    // 후처리 검증
    if (!json.name?.trim()) {
      return NextResponse.json({ error: "OCR 검증 실패", field: "name", message: "상호명을 읽을 수 없습니다", raw: text }, { status: 422 });
    }

    if (json.business_number && !/^\d{3}-\d{2}-\d{5}$/.test(json.business_number)) {
      return NextResponse.json({ error: "OCR 검증 실패", field: "business_number", message: "사업자등록번호 형식 오류", raw: text }, { status: 422 });
    }

    if (json.address && !/(시|도|군|구)/.test(json.address)) {
      return NextResponse.json({ error: "OCR 검증 실패", field: "address", message: "주소 형식 오류", raw: text }, { status: 422 });
    }

    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OCR 처리 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
