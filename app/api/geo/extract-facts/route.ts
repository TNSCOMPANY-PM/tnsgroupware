import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { runExtractFacts, type ProgressEvent } from "@/utils/runExtractFacts";

function makeEmitter(controller: ReadableStreamDefaultController | null) {
  const encoder = new TextEncoder();
  return (ev: ProgressEvent) => {
    if (!controller) return;
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
    } catch { /* closed */ }
  };
}

export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as { brand_id: string };
  if (!body.brand_id) return NextResponse.json({ error: "brand_id required" }, { status: 400 });

  const url = new URL(request.url);
  const wantsStream = url.searchParams.get("stream") === "1";

  if (!wantsStream) {
    const { status, body: resBody } = await runExtractFacts(body.brand_id);
    return NextResponse.json(resBody, { status });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const emit = makeEmitter(controller);
      try {
        await runExtractFacts(body.brand_id, emit);
      } catch (e) {
        emit({ stage: "error", error: e instanceof Error ? e.message : "unknown" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
