import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .select("id,applicant_name,start_date,end_date,status")
    .lte("start_date", "2026-04-03")
    .gte("end_date", "2026-03-30")
    .order("start_date");
  return NextResponse.json({ data, error });
}
