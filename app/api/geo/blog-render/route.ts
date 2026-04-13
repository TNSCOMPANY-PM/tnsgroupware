import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

// blog-renderer를 동적으로 require (Node.js CJS 모듈)
function getRenderer() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../../../../blog-renderer/index") as {
    render: (postData: unknown, options?: { skipMedium?: boolean }) => Promise<{
      tistory: string;
      frandoor: string;
      naver: string;
      medium: string | null;
      validation: Record<string, { ok: boolean; issues: string[] }>;
    }>;
  };
}

/**
 * POST /api/geo/blog-render
 *
 * postData JSON을 받아서 4개 플랫폼 HTML을 생성합니다.
 * 기존 blog-generate API는 AI가 HTML을 직접 생성하지만,
 * 이 API는 구조화된 postData → 렌더러 → 일관된 HTML 변환입니다.
 */
export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as {
    postData: Record<string, unknown>;
    skipMedium?: boolean;
  };

  if (!body.postData?.meta || !body.postData?.sections) {
    return NextResponse.json({ error: "postData.meta, postData.sections 필수" }, { status: 400 });
  }

  try {
    const renderer = getRenderer();
    const result = await renderer.render(body.postData, {
      skipMedium: body.skipMedium ?? true,
    });

    return NextResponse.json({
      tistory: result.tistory,
      frandoor: result.frandoor,
      naver: result.naver,
      medium: result.medium,
      validation: result.validation,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "렌더링 실패" },
      { status: 500 }
    );
  }
}
