import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "query_transactions",
      description: "입금 내역을 조회합니다. 특정 날짜, 고객사, 금액 기준으로 필터링 가능합니다.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "조회할 날짜 (YYYY-MM-DD). 오늘이면 today" },
          client_name: { type: "string", description: "고객사 이름 (부분 일치)" },
          limit: { type: "number", description: "최대 조회 건수 (기본 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_leaves",
      description: "휴가 신청 내역을 조회합니다. 특정 날짜에 휴가자가 누구인지, 승인 상태 등을 확인합니다.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "해당 날짜에 휴가인 직원 조회 (YYYY-MM-DD)" },
          status: { type: "string", description: "휴가 상태: 승인_완료, C레벨_최종_승인_대기, 팀장_1차_승인_대기" },
          employee_name: { type: "string", description: "특정 직원 이름" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_approvals",
      description: "전자결재 내역을 조회합니다. 대기 중인 결재, 특정 사람의 결재 등을 확인합니다.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "결재 상태: pending, approved, rejected" },
          requester_name: { type: "string", description: "신청자 이름" },
          type: { type: "string", description: "결재 유형: expense(정산요청), purchase(비품구입), etc(기타)" },
          limit: { type: "number", description: "최대 조회 건수 (기본 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_finance",
      description: "매출매입 원장을 조회합니다. 월별 매출, 매입, 손익 등을 확인합니다.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "string", description: "조회할 월 (YYYY-MM). 이번달이면 current" },
          type: { type: "string", description: "매출 또는 매입" },
          category: { type: "string", description: "카테고리 (더널리, 티제이웹 등)" },
          limit: { type: "number", description: "최대 조회 건수 (기본 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_employees",
      description: "직원 정보를 조회합니다. 재직 중인 직원 목록, 부서, 역할 등을 확인합니다.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "직원 이름 (부분 일치)" },
          department: { type: "string", description: "부서명" },
          role: { type: "string", description: "역할: C레벨, 팀장, 사원" },
        },
      },
    },
  },
];

async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  if (name === "query_transactions") {
    let query = supabase.from("transactions").select("date,amount,depositor,matched_client,status").order("date", { ascending: false });
    const date = args.date === "today" ? today : (args.date as string | undefined);
    if (date) query = query.eq("date", date);
    if (args.client_name) query = query.ilike("matched_client", `%${args.client_name}%`);
    query = query.limit((args.limit as number) ?? 20);
    const { data, error } = await query;
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "해당 조건의 입금 내역이 없습니다.";
    return JSON.stringify(data);
  }

  if (name === "query_leaves") {
    let query = supabase.from("leaves").select("employee_name,leave_type,start_date,end_date,status,reason");
    if (args.date) {
      query = query.lte("start_date", args.date as string).gte("end_date", args.date as string);
    }
    if (args.status) query = query.eq("status", args.status as string);
    if (args.employee_name) query = query.ilike("employee_name", `%${args.employee_name}%`);
    query = query.order("start_date", { ascending: false }).limit(20);
    const { data, error } = await query;
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "해당 조건의 휴가 내역이 없습니다.";
    return JSON.stringify(data);
  }

  if (name === "query_approvals") {
    let query = supabase.from("approvals").select("title,type,requester_name,status,amount,created_at,reject_reason");
    if (args.status) query = query.eq("status", args.status as string);
    if (args.requester_name) query = query.ilike("requester_name", `%${args.requester_name}%`);
    if (args.type) query = query.eq("type", args.type as string);
    query = query.order("created_at", { ascending: false }).limit((args.limit as number) ?? 10);
    const { data, error } = await query;
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "해당 조건의 결재 내역이 없습니다.";
    return JSON.stringify(data);
  }

  if (name === "query_finance") {
    let query = supabase.from("finance").select("date,month,type,amount,category,description,client_name,status");
    const month = args.month === "current" ? today.slice(0, 7) : (args.month as string | undefined);
    if (month) query = query.eq("month", month);
    if (args.type) query = query.eq("type", args.type as string);
    if (args.category) query = query.ilike("category", `%${args.category}%`);
    query = query.order("date", { ascending: false }).limit((args.limit as number) ?? 20);
    const { data, error } = await query;
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "해당 조건의 원장 데이터가 없습니다.";
    return JSON.stringify(data);
  }

  if (name === "query_employees") {
    let query = supabase.from("employees").select("name,department,role,emp_number,email").eq("status", "재직");
    if (args.name) query = query.ilike("name", `%${args.name}%`);
    if (args.department) query = query.ilike("department", `%${args.department}%`);
    if (args.role) query = query.eq("role", args.role as string);
    const { data, error } = await query;
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "해당 조건의 직원이 없습니다.";
    return JSON.stringify(data);
  }

  return "알 수 없는 툴입니다.";
}

export async function POST(req: Request) {
  const { messages } = await req.json() as { messages: OpenAI.Chat.ChatCompletionMessageParam[] };

  const today = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });

  const systemPrompt = `당신은 TNS 그룹웨어의 업무 도우미입니다. 오늘 날짜/시간은 ${today}입니다.
직원들의 입금 내역, 휴가, 전자결재, 매출매입 원장, 직원 정보를 조회해서 답변합니다.
답변은 한국어로, 간결하고 친근하게 합니다. 숫자는 원화 형식(xxx,xxx원)으로 표시하세요.`;

  const allMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  // tool use 루프
  for (let i = 0; i < 5; i++) {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: allMessages,
      tools,
      tool_choice: "auto",
    });

    const msg = res.choices[0]?.message;
    if (!msg) break;
    allMessages.push(msg);

    if (!msg.tool_calls?.length) {
      return NextResponse.json({ reply: msg.content ?? "" });
    }

    for (const tc of msg.tool_calls) {
      const fn = (tc as unknown as { function: { name: string; arguments: string } }).function;
      const result = await runTool(fn.name, JSON.parse(fn.arguments) as Record<string, unknown>);
      allMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  return NextResponse.json({ reply: "답변을 생성하지 못했습니다." });
}
