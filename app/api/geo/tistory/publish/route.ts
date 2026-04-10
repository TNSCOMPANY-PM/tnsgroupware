import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { getAccessToken } from "@/utils/tistoryAuth";
import type { TistoryPublishRequest } from "@/types/tistory";

const BLOG_NAME = process.env.TISTORY_BLOG_NAME!;

export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body: TistoryPublishRequest = await request.json();

  if (!body.title?.trim() || !body.content?.trim()) {
    return NextResponse.json(
      { error: "title, content 필수" },
      { status: 400 }
    );
  }

  const accessToken = await getAccessToken();

  const params = new URLSearchParams({
    access_token: accessToken,
    output: "json",
    blogName: BLOG_NAME,
    title: body.title,
    content: body.content,
    visibility: String(body.visibility ?? 3),
    category: String(body.category_id ?? 0),
    tag: (body.tags ?? []).join(","),
    acceptComment: "1",
  });

  const res = await fetch("https://www.tistory.com/apis/post/write", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = await res.json();

  if (data.tistory?.status !== "200") {
    return NextResponse.json(
      { error: "발행 실패", detail: data },
      { status: 502 }
    );
  }

  return NextResponse.json({
    postUrl: data.tistory.url,
    postId: data.tistory.postId,
  });
}
