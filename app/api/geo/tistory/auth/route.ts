import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const params = new URLSearchParams({
    client_id: process.env.TISTORY_APP_ID!,
    redirect_uri: process.env.TISTORY_REDIRECT_URI!,
    response_type: "code",
  });

  return NextResponse.redirect(
    `https://www.tistory.com/oauth/authorize?${params.toString()}`
  );
}
