import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * 이중 소스 UI 초기 로드용.
 * brand_source_doc / brand_fact_data / brand_fact_diffs 를 한 번에 조회.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id: brandId } = await context.params;
  const supabase = createAdminClient();

  const [{ data: doc }, { data: facts }, { data: diffs }] = await Promise.all([
    supabase.from("brand_source_doc").select("file_name, uploaded_at, markdown_text").eq("brand_id", brandId).maybeSingle(),
    supabase.from("brand_fact_data").select("*").eq("brand_id", brandId).order("label"),
    supabase.from("brand_fact_diffs").select("*").eq("brand_id", brandId).order("diff_ratio", { ascending: false }),
  ]);

  return NextResponse.json({
    source_doc: doc ? {
      file_name: doc.file_name,
      uploaded_at: doc.uploaded_at,
      markdown_chars: (doc.markdown_text ?? "").length,
    } : null,
    facts: facts ?? [],
    diffs: diffs ?? [],
  });
}
