import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  verifyMasterToken,
  getMasterCookieName,
} from "./utils/masterAuth";

const PUBLIC_PATHS = ["/login", "/api/webhook", "/api/cron"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export async function proxy(request: NextRequest) {
  try {
    const response = NextResponse.next({
      request: { headers: request.headers },
    });

    const { pathname } = request.nextUrl;

    // 공개 경로는 통과
    if (isPublicPath(pathname)) return response;

    const masterCookie = request.cookies.get(getMasterCookieName())?.value;
    let isMasterSession = false;
    try {
      isMasterSession = !!(masterCookie && (await verifyMasterToken(masterCookie)));
    } catch {
      // 토큰 검증 실패 시 비마스터로 처리
    }

    if (!isMasterSession) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("next", request.nextUrl.pathname);
        return NextResponse.redirect(loginUrl);
      }
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll() {
            return request.cookies.getAll().map((c) => ({
              name: c.name,
              value: c.value,
            }));
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options ?? { path: "/" })
            );
          },
        },
      });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("next", request.nextUrl.pathname);
        return NextResponse.redirect(loginUrl);
      }
    }
    return response;
  } catch (_e) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
