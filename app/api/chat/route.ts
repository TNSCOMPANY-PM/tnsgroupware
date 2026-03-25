import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { generateDailyHoroscope } from "@/utils/generateDailyHoroscope";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type UserContext = {
  userId: string;
  empNumber: string;
  name: string;
  department: string;
  role: string;
};

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  // ── 조회 ──────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "query_finance",
      description: "입금/매출/매입 원장을 조회합니다. '오늘 입금', '이번달 매출', '노스푼 입금' 같은 질문에 사용합니다.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "특정 날짜 (YYYY-MM-DD). 오늘이면 today" },
          month: { type: "string", description: "특정 월 (YYYY-MM). 이번달이면 current" },
          type: { type: "string", description: "매출 또는 매입" },
          client_name: { type: "string", description: "고객사명 (부분 일치)" },
          limit: { type: "number", description: "최대 건수 (기본 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_leaves",
      description: "휴가 내역을 조회합니다. 특정 날짜 휴가자, 내 휴가 현황 등을 확인합니다.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "해당 날짜 휴가자 조회 (YYYY-MM-DD)" },
          employee_name: { type: "string", description: "직원 이름" },
          status: { type: "string", description: "상태: 승인_완료, C레벨_최종_승인_대기, 팀장_1차_승인_대기" },
          mine: { type: "boolean", description: "내 휴가만 조회할 때 true" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_approvals",
      description: "전자결재 내역을 조회합니다. 대기 결재, 내 결재 현황 등을 확인합니다.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "pending, approved, rejected" },
          mine: { type: "boolean", description: "내 결재만 조회할 때 true" },
          limit: { type: "number", description: "최대 건수 (기본 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_employees",
      description: "직원 정보를 조회합니다.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "직원 이름 (부분 일치)" },
          department: { type: "string", description: "부서명" },
        },
      },
    },
  },

  {
    type: "function",
    function: {
      name: "get_horoscope",
      description: "오늘의 운세를 알려줍니다. '운세', '오늘 운세', '행운의 번호' 등 요청 시 사용합니다.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ── 실행 ──────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "create_leave",
      description: "휴가를 신청합니다. 본인 명의로만 가능합니다. 반드시 확인 후 실행하세요.",
      parameters: {
        type: "object",
        properties: {
          leave_type: { type: "string", description: "연차, 반차(오전), 반차(오후), 병가, 경조사" },
          start_date: { type: "string", description: "시작일 (YYYY-MM-DD)" },
          end_date: { type: "string", description: "종료일 (YYYY-MM-DD). 당일이면 start_date와 동일" },
          days: { type: "number", description: "일수. 연차 1일=1, 반차=0.5" },
          reason: { type: "string", description: "사유 (선택)" },
        },
        required: ["leave_type", "start_date", "end_date", "days"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_leave",
      description: "내 휴가를 취소합니다. 승인 전이면 삭제, 승인 후면 취소 처리됩니다.",
      parameters: {
        type: "object",
        properties: {
          leave_id: { type: "string", description: "취소할 휴가 ID" },
        },
        required: ["leave_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_approval",
      description: "전자결재를 신청합니다. 정산요청, 비품구입, 기타 결재를 올릴 수 있습니다.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", description: "expense(정산요청), purchase(비품구입), etc(기타)" },
          title: { type: "string", description: "결재 제목. 고객사명 등" },
          content: { type: "string", description: "결재 내용 상세" },
          amount: { type: "number", description: "금액 (원)" },
          payment_reason: { type: "string", description: "정산요청 사유" },
          sheet_classification: { type: "string", description: "시트 분류: 결제, 정산, 환불, 슬롯구입정산, CPC리워드" },
          bank: { type: "string", description: "입금 은행" },
          account_number: { type: "string", description: "계좌번호" },
          account_holder_name: { type: "string", description: "예금주" },
        },
        required: ["type", "title", "amount"],
      },
    },
  },
];

async function runTool(name: string, args: Record<string, unknown>, user: UserContext): Promise<string> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  if (name === "get_horoscope") {
    const fortune = generateDailyHoroscope({ name: user.name }, today);
    return JSON.stringify({
      총운: fortune.totalFortune,
      재물운: `${fortune.wealthLuck}/5`,
      업무운: `${fortune.workLuck}/5`,
      행운의색: fortune.luckyColor,
      행운의번호: fortune.lottoNumbers.join(", "),
    });
  }

  // ── 조회 ──────────────────────────────────────────────────────────────
  if (name === "query_finance") {
    let query = supabase.from("finance").select("date,month,type,amount,client_name,description,category,status").order("date", { ascending: false });
    const date = args.date === "today" ? today : (args.date as string | undefined);
    if (date) query = query.eq("date", date);
    const month = args.month === "current" ? today.slice(0, 7) : (args.month as string | undefined);
    if (month) query = query.eq("month", month);
    if (args.type) query = query.eq("type", args.type as string);
    if (args.client_name) query = query.ilike("client_name", `%${args.client_name}%`);
    query = query.limit((args.limit as number) ?? 20);
    const { data, error } = await query;
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "해당 조건의 내역이 없습니다.";
    return JSON.stringify(data);
  }

  if (name === "query_leaves") {
    let query = supabase.from("leave_requests").select("id,applicant_name,applicant_department,leave_type,start_date,end_date,days,status,reason");
    if (args.date) query = query.lte("start_date", args.date as string).gte("end_date", args.date as string);
    if (args.mine) query = query.eq("applicant_id", user.userId);
    if (args.employee_name) query = query.ilike("applicant_name", `%${args.employee_name}%`);
    if (args.status) query = query.eq("status", args.status as string);
    query = query.order("start_date", { ascending: false }).limit(20);
    const { data, error } = await query;
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "해당 조건의 휴가 내역이 없습니다.";
    return JSON.stringify(data);
  }

  if (name === "query_approvals") {
    let query = supabase.from("approvals").select("id,title,type,requester_name,status,amount,created_at,reject_reason");
    if (args.mine) query = query.eq("requester_id", user.userId);
    if (args.status) query = query.eq("status", args.status as string);
    query = query.order("created_at", { ascending: false }).limit((args.limit as number) ?? 10);
    const { data, error } = await query;
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "해당 조건의 결재 내역이 없습니다.";
    return JSON.stringify(data);
  }

  if (name === "query_employees") {
    let query = supabase.from("employees").select("name,department,role,emp_number").eq("status", "재직");
    if (args.name) query = query.ilike("name", `%${args.name}%`);
    if (args.department) query = query.ilike("department", `%${args.department}%`);
    const { data, error } = await query;
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "해당 직원이 없습니다.";
    return JSON.stringify(data);
  }

  // ── 실행 ──────────────────────────────────────────────────────────────
  if (name === "create_leave") {
    const NEEDS_INTERMEDIATE = ["TNS-20220117", "TNS-20220801"];
    const status = NEEDS_INTERMEDIATE.includes(user.empNumber)
      ? "팀장_1차_승인_대기"
      : "C레벨_최종_승인_대기";

    const insert = {
      applicant_id: user.userId,
      applicant_name: user.name,
      applicant_department: user.department,
      leave_type: args.leave_type,
      start_date: args.start_date,
      end_date: args.end_date,
      days: args.days,
      reason: args.reason ?? "",
      status,
      requires_proof: false,
      proof_status: null,
    };
    const { data, error } = await supabase.from("leave_requests").insert(insert).select().single();
    if (error) return `휴가 신청 실패: ${error.message}`;
    return `✅ 휴가가 신청되었습니다. (ID: ${(data as Record<string, unknown>).id}, 상태: ${status})`;
  }

  if (name === "cancel_leave") {
    const { data: leave, error: fetchErr } = await supabase
      .from("leave_requests").select("*").eq("id", args.leave_id as string).single();
    if (fetchErr || !leave) return "해당 휴가를 찾을 수 없습니다.";
    const l = leave as Record<string, unknown>;
    if (l.applicant_id !== user.userId) return "본인의 휴가만 취소할 수 있습니다.";
    const isPending = ["C레벨_최종_승인_대기", "팀장_1차_승인_대기"].includes(l.status as string);
    if (isPending) {
      const { error } = await supabase.from("leave_requests").delete().eq("id", args.leave_id as string);
      if (error) return `취소 실패: ${error.message}`;
      return "✅ 휴가 신청이 취소(삭제)되었습니다.";
    } else if (l.status === "승인_완료") {
      const { error } = await supabase.from("leave_requests").update({ status: "CANCELED" }).eq("id", args.leave_id as string);
      if (error) return `취소 실패: ${error.message}`;
      return "✅ 승인된 휴가가 취소 처리되었습니다.";
    }
    return "취소할 수 없는 상태입니다.";
  }

  if (name === "create_approval") {
    const insert: Record<string, unknown> = {
      type: args.type,
      title: args.title,
      content: args.content ?? "",
      amount: args.amount,
      requester_name: user.name,
      requester_id: user.userId,
      status: "pending",
    };
    if (args.payment_reason) insert.payment_reason = args.payment_reason;
    if (args.sheet_classification) insert.sheet_classification = args.sheet_classification;
    if (args.bank) insert.bank = args.bank;
    if (args.account_number) insert.account_number = args.account_number;
    if (args.account_holder_name) insert.account_holder_name = args.account_holder_name;

    const { data, error } = await supabase.from("approvals").insert(insert).select().single();
    if (error) return `결재 신청 실패: ${error.message}`;

    // finance 미승인 매입 자동 생성
    if (args.type === "expense" || args.type === "purchase") {
      const month = today.slice(0, 7);
      await supabase.from("finance").insert({
        month, date: today, type: "매입",
        amount: args.amount,
        status: "UNMAPPED",
        description: `결재: ${args.title} | 신청자: ${user.name}`,
        client_name: args.title,
        approval_id: String((data as Record<string, unknown>).id),
      } as Record<string, unknown>);
    }

    // Pushbullet 알림
    const apiKey = process.env.PUSHBULLET_API_KEY?.trim();
    if (apiKey) {
      fetch("https://api.pushbullet.com/v2/pushes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Access-Token": apiKey },
        body: JSON.stringify({ type: "note", title: "전자결재 새 건", body: `요청자: ${user.name}\n제목: ${args.title}\n금액: ${Number(args.amount).toLocaleString()}원` }),
      }).catch(() => {});
    }

    return `✅ 결재가 신청되었습니다. (제목: ${args.title}, 금액: ${Number(args.amount).toLocaleString()}원)`;
  }

  return "알 수 없는 툴입니다.";
}

export async function POST(req: Request) {
  const { messages, user } = await req.json() as {
    messages: OpenAI.Chat.ChatCompletionMessageParam[];
    user: UserContext;
  };

  const today = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });

  const systemPrompt = `당신은 TNS 그룹웨어의 업무 도우미 AI입니다.
오늘 날짜/시간: ${today}
현재 사용자: ${user.name} (${user.department}, ${user.role}, emp: ${user.empNumber})

역할:
- 입금/매출, 휴가, 결재, 직원 정보를 조회하거나 실행할 수 있습니다.
- 조회는 바로 실행합니다.
- 휴가 신청, 결재 신청 등 **쓰기 작업은 반드시 먼저 "~하시겠어요?" 로 확인**하고, 사용자가 "응", "네", "맞아", "해줘" 등으로 동의하면 실행합니다.
- 본인 명의로만 휴가/결재를 신청합니다. (${user.name})
- 금액은 xxx,xxx원 형식으로 표시합니다.
- 답변은 한국어로 간결하고 친근하게 합니다.`;

  const allMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  for (let i = 0; i < 6; i++) {
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
      const result = await runTool(fn.name, JSON.parse(fn.arguments) as Record<string, unknown>, user);
      allMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  return NextResponse.json({ reply: "답변을 생성하지 못했습니다." });
}
