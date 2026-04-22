// 프로덕션 에러 메시지 redaction 공용 헬퍼.
// - dev (NODE_ENV !== "production"): 디버깅 편의로 실제 message 반환
// - prod                          : 내부 구조 힌트 차단 — 고정 메시지 반환, 실제는 서버 로그에만
export interface ErrorResponseBody {
  error: string;
  message: string;
}

export function toErrorResponse(
  e: unknown,
  code: string,
): { body: ErrorResponseBody; status: number } {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[${code}]`, msg, e instanceof Error ? e.stack : undefined);
  return {
    body: {
      error: code,
      message: process.env.NODE_ENV === "production" ? "처리 중 오류 발생" : msg,
    },
    status: 500,
  };
}
