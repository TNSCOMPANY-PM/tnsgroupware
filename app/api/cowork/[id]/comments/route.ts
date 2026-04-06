import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

async function logActivity(
  supabase: ReturnType<typeof createAdminClient>,
  coworkId: string,
  actorId: string,
  actorName: string,
  action: string,
  targetTitle?: string
) {
  await supabase.from("cowork_activities").insert({
    cowork_id: coworkId,
    actor_id: actorId,
    actor_name: actorName,
    action,
    target_title: targetTitle,
  });
}

function parseMentions(content: string): string[] {
  const matches = content.match(/@([\w가-힣]+)/g);
  return matches ? matches.map((m) => m.slice(1)) : [];
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("task_id");
  const postId = searchParams.get("post_id");

  const supabase = createAdminClient();

  let query = supabase
    .from("cowork_comments")
    .select("*")
    .eq("cowork_id", id)
    .order("created_at", { ascending: true });

  if (taskId) query = query.eq("task_id", taskId);
  if (postId) query = query.eq("post_id", postId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id } = await params;
  const body = await req.json() as { task_id?: string; post_id?: string; content: string };
  const { task_id, post_id, content } = body;

  if ((!task_id && !post_id) || !content) {
    return NextResponse.json({ error: "task_id or post_id, and content are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("cowork_comments")
    .insert({
      cowork_id: id,
      task_id: task_id ?? null,
      post_id: post_id ?? null,
      author_id: String(session.employeeId),
      author_name: session.name,
      content,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mentions = parseMentions(content);
  if (mentions.length > 0) {
    await logActivity(supabase, id, String(session.employeeId), session.name, "comment_mention", mentions.join(", "));
  }

  return NextResponse.json(data, { status: 201 });
}
