import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized, forbidden } from "@/utils/apiAuth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id, requestId } = await params;
  const supabase = createAdminClient();

  const { data: req } = await supabase.from("cowork_requests").select("to_id, title").eq("id", requestId).single();
  if (!req) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (req.to_id !== session.userId) return forbidden();

  const body = await request.json() as { status: "accepted" | "rejected" | "done" };
  const { error } = await supabase.from("cowork_requests").update({ status: body.status }).eq("id", requestId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actionMap = { accepted: "request_accepted", rejected: "request_rejected", done: "request_done" };
  await supabase.from("cowork_activities").insert({ cowork_id: id, actor_id: session.userId, actor_name: session.name, action: actionMap[body.status] ?? "request_updated", target_title: req.title });

  return NextResponse.json({ ok: true });
}
