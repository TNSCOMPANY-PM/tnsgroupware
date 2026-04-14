import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import { parseFileWithMeta } from "@/utils/fileParser";

/**
 * docx 단일 업로드: brand_source_doc upsert.
 * Body: { file_url, file_name }
 *   - file_url: Supabase storage 의 public URL (클라이언트가 먼저 업로드)
 *   - file_name: 원본 파일명 (*.docx)
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id: brandId } = await context.params;
  const body = await request.json() as { file_url: string; file_name: string };
  if (!body.file_url || !body.file_name) {
    return NextResponse.json({ error: "file_url, file_name 필요" }, { status: 400 });
  }
  const ext = body.file_name.split(".").pop()?.toLowerCase();
  if (ext !== "docx") {
    return NextResponse.json({ error: "docx 만 허용" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("brand_source_doc")
    .select("file_hash")
    .eq("brand_id", brandId)
    .maybeSingle();

  const meta = await parseFileWithMeta(body.file_url, body.file_name);
  if (meta.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: `docx 10MB 초과 (${(meta.size / 1024 / 1024).toFixed(1)}MB)` }, { status: 400 });
  }
  if (!meta.text || meta.text.length < 50) {
    return NextResponse.json({ error: "docx 에서 텍스트 추출 실패" }, { status: 400 });
  }

  if (existing && existing.file_hash === meta.hash) {
    return NextResponse.json({
      ok: true,
      unchanged: true,
      message: "동일한 파일 (해시 일치) — 재업로드 스킵",
      markdown_chars: meta.text.length,
    });
  }

  const { error } = await supabase
    .from("brand_source_doc")
    .upsert({
      brand_id: brandId,
      file_name: body.file_name,
      file_hash: meta.hash,
      markdown_text: meta.text,
      uploaded_at: new Date().toISOString(),
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    unchanged: false,
    markdown_chars: meta.text.length,
  });
}
