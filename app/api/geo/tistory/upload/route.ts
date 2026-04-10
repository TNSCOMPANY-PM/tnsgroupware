import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { getAccessToken } from "@/utils/tistoryAuth";

const BLOG_NAME = process.env.TISTORY_BLOG_NAME!;

export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const accessToken = await getAccessToken();
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "file 필드 필수" }, { status: 400 });
  }

  const uploadForm = new FormData();
  uploadForm.append("uploadedfile", file);

  const res = await fetch(
    `https://www.tistory.com/apis/post/attach?access_token=${accessToken}&blogName=${BLOG_NAME}&output=json`,
    { method: "POST", body: uploadForm }
  );
  const data = await res.json();

  if (data.tistory?.status !== "200") {
    return NextResponse.json(
      { error: "이미지 업로드 실패", detail: data },
      { status: 502 }
    );
  }

  const rawUrl: string = data.tistory.url;
  const fileId = rawUrl.slice(rawUrl.lastIndexOf("/") + 1, rawUrl.length - 4);
  const cdnUrl = `https://t1.daumcdn.net/cfile/tistory/${fileId}?original`;

  return NextResponse.json({ url: cdnUrl, originalUrl: rawUrl });
}
