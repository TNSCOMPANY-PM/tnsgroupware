import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { exchangeCodeForToken } from "@/utils/tistoryAuth";

export async function GET(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return new NextResponse(
      "<h1>인증 실패: code가 없습니다</h1>",
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  try {
    await exchangeCodeForToken(code);
    return new NextResponse(
      "<html><body><h1>티스토리 인증 완료!</h1><p>이 창을 닫아도 됩니다.</p><script>window.close()</script></body></html>",
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "알 수 없는 오류";
    return new NextResponse(
      `<h1>토큰 발급 실패</h1><p>${msg}</p>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}
