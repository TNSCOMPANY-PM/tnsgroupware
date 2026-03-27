import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { generateDailyHoroscope } from "@/utils/generateDailyHoroscope";
import { LUNCH_MENUS } from "@/constants/dashboard";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type UserContext = {
  userId: string;
  empNumber: string;
  name: string;
  department: string;
  role: string;
};

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  // ── 유틸리티 ─────────────────────────────────────────────────────────
  { type: "function", function: { name: "get_horoscope", description: "오늘의 운세, 행운의 번호, 재물운, 업무운을 알려줍니다.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_lunch", description: "점심 메뉴를 추천합니다.", parameters: { type: "object", properties: {} } } },

  // ── 조회 ─────────────────────────────────────────────────────────────
  {
    type: "function", function: {
      name: "query_finance_summary",
      description: "매출액·매입액·매출총이익을 정확히 계산합니다. '매출총이익', '매출액', '매입액', '손익' 등을 물어볼 때 반드시 이 툴을 사용합니다. 특정 날짜(오늘/어제/날짜)를 말하면 반드시 date 파라미터를 사용합니다. month는 명시적으로 '이번달', 'N월' 등 월 단위를 요청할 때만 사용합니다.",
      parameters: { type: "object", properties: {
        month: { type: "string", description: "월 단위 조회 (YYYY-MM). 이번달=current. 날짜를 물어볼 때는 사용하지 않습니다." },
        date: { type: "string", description: "날짜 (YYYY-MM-DD). 오늘=today, 어제=yesterday. 날짜 지정 시 항상 이것을 사용합니다." },
      }},
    },
  },
  {
    type: "function", function: {
      name: "query_finance",
      description: "매출·매입 원장을 조회합니다. 입금 내역, 특정 고객사 거래, 월별 매출 등을 확인합니다.",
      parameters: { type: "object", properties: {
        date: { type: "string", description: "날짜 (YYYY-MM-DD). 오늘=today, 어제=yesterday" },
        month: { type: "string", description: "월 (YYYY-MM). 이번달=current" },
        type: { type: "string", enum: ["매출", "매입"], description: "입금·매출=매출, 출금·매입=매입. '입금내역'을 물어보면 반드시 '매출'을 사용합니다." },
        client_name: { type: "string", description: "고객사명 (부분일치)" },
        limit: { type: "number" },
      }},
    },
  },
  {
    type: "function", function: {
      name: "query_leaves",
      description: "휴가 내역을 조회합니다. 특정 날짜·기간 휴가자, 내 휴가 현황, 승인 대기 휴가를 확인합니다. '이번 주'·'다음 주' 같은 기간 질문엔 date_from과 date_to를 함께 사용합니다.",
      parameters: { type: "object", properties: {
        date: { type: "string", description: "특정 날짜 휴가자 조회 (YYYY-MM-DD). 단일 날짜일 때만 사용합니다." },
        date_from: { type: "string", description: "기간 조회 시작일 (YYYY-MM-DD). 이번 주·다음 주 등 범위 조회 시 date_to와 함께 사용합니다." },
        date_to: { type: "string", description: "기간 조회 종료일 (YYYY-MM-DD). date_from과 함께 사용합니다." },
        employee_name: { type: "string", description: "직원 이름" },
        status: { type: "string", description: "승인_완료 / C레벨_최종_승인_대기 / 팀장_1차_승인_대기" },
        mine: { type: "boolean", description: "내 휴가만 조회" },
      }},
    },
  },
  {
    type: "function", function: {
      name: "query_approvals",
      description: "전자결재 내역을 조회합니다. 대기 결재, 내 결재 현황 등을 확인합니다.",
      parameters: { type: "object", properties: {
        status: { type: "string", description: "pending / approved / rejected" },
        mine: { type: "boolean", description: "내 결재만 조회" },
        limit: { type: "number" },
      }},
    },
  },
  {
    type: "function", function: {
      name: "query_employees",
      description: "직원 정보를 조회합니다. 재직자 목록, 부서, 역할을 확인합니다.",
      parameters: { type: "object", properties: {
        name: { type: "string", description: "직원 이름 (부분일치)" },
        department: { type: "string", description: "부서명" },
        role: { type: "string", description: "C레벨 / 팀장 / 사원" },
      }},
    },
  },
  {
    type: "function", function: {
      name: "query_clients",
      description: "고객사(CRM) 정보를 조회합니다. 거래처 목록, 사업자번호, 대표자 등을 확인합니다. name으로 검색하면 상호명·대표자명·입금자명 모두에서 찾습니다.",
      parameters: { type: "object", properties: {
        name: { type: "string", description: "검색어 — 상호명, 대표자명, 입금자명 중 하나 (부분일치)" },
        category: { type: "string", description: "카테고리" },
      }},
    },
  },
  {
    type: "function", function: {
      name: "query_announcements",
      description: "공지사항을 조회합니다. 최근 공지, 중요 공지 등을 확인합니다.",
      parameters: { type: "object", properties: {
        limit: { type: "number", description: "최대 건수 (기본 10)" },
        important_only: { type: "boolean", description: "중요 공지만" },
      }},
    },
  },
  {
    type: "function", function: {
      name: "query_events",
      description: "캘린더 일정을 조회합니다. 이번 주/이번 달 일정, 특정 날짜 일정을 확인합니다.",
      parameters: { type: "object", properties: {
        from: { type: "string", description: "시작 날짜 (YYYY-MM-DD). 이번달 시작=current_month_start, 오늘=today" },
        to: { type: "string", description: "종료 날짜 (YYYY-MM-DD). 이번달 끝=current_month_end" },
        keyword: { type: "string", description: "제목 검색어" },
      }},
    },
  },
  {
    type: "function", function: {
      name: "query_kanban",
      description: "칸반 보드의 할일 카드를 조회합니다. todo/in_progress/done 컬럼별로 확인합니다.",
      parameters: { type: "object", properties: {
        column: { type: "string", description: "todo / in_progress / done" },
        assignee: { type: "string", description: "담당자 이름" },
      }},
    },
  },
  {
    type: "function", function: {
      name: "query_assets",
      description: "비품/자산 목록을 조회합니다.",
      parameters: { type: "object", properties: {
        name: { type: "string", description: "비품명 (부분일치)" },
        category: { type: "string", description: "카테고리" },
      }},
    },
  },
  {
    type: "function", function: {
      name: "query_bonus",
      description: "성과급 정보를 조회합니다. 내 이번 분기 예상 성과급을 확인합니다.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function", function: {
      name: "query_team_bonus",
      description: "팀 전체 분기 성과급 지급 예상액을 조회합니다. C레벨 권한 필요.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function", function: {
      name: "query_annual_leaves",
      description: "직원별 연차 현황(발생/사용/잔여)을 조회합니다.",
      parameters: { type: "object", properties: {
        employee_name: { type: "string", description: "특정 직원 이름 (없으면 전체)" },
      }},
    },
  },
  {
    type: "function", function: {
      name: "query_burnout_risk",
      description: "최근 90일간 연차를 사용하지 않은 번아웃 위험 직원을 조회합니다.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function", function: {
      name: "query_projects",
      description: "간트 차트의 프로젝트 목록과 진행률을 조회합니다.",
      parameters: { type: "object", properties: {
        status: { type: "string", description: "진행 상태 필터" },
      }},
    },
  },
  {
    type: "function", function: {
      name: "query_unmatched_finance",
      description: "원장에서 고객사와 매핑되지 않은 입금 내역을 조회합니다.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ── 실행 ─────────────────────────────────────────────────────────────
  {
    type: "function", function: {
      name: "create_leave",
      description: "휴가를 신청합니다. 본인 명의로만 가능. 쓰기 전 반드시 확인하세요.",
      parameters: { type: "object", properties: {
        leave_type: { type: "string", description: "연차 / 반차(오전) / 반차(오후) / 병가 / 경조사" },
        start_date: { type: "string", description: "시작일 (YYYY-MM-DD)" },
        end_date: { type: "string", description: "종료일 (YYYY-MM-DD)" },
        days: { type: "number", description: "일수. 연차=1, 반차=0.5" },
        reason: { type: "string" },
      }, required: ["leave_type", "start_date", "end_date", "days"]},
    },
  },
  {
    type: "function", function: {
      name: "cancel_leave",
      description: "내 휴가를 취소합니다. 먼저 query_leaves로 ID를 확인하세요.",
      parameters: { type: "object", properties: {
        leave_id: { type: "string" },
      }, required: ["leave_id"]},
    },
  },
  {
    type: "function", function: {
      name: "approve_leave",
      description: "휴가를 승인하거나 반려합니다. 팀장/C레벨 권한 필요.",
      parameters: { type: "object", properties: {
        leave_id: { type: "string" },
        action: { type: "string", description: "approve 또는 reject" },
      }, required: ["leave_id", "action"]},
    },
  },
  {
    type: "function", function: {
      name: "prepare_approval",
      description: "전자결재 신청 전 확인 단계. 반드시 이 툴을 먼저 호출해 사용자에게 내용을 보여주고 동의를 받아야 합니다. query_clients로 카테고리 조회 후 호출합니다.",
      parameters: { type: "object", properties: {
        title: { type: "string", description: "결재 제목 (고객사명)" },
        amount: { type: "number", description: "금액(원)" },
        date: { type: "string", description: "날짜 (YYYY-MM-DD 또는 today)" },
        sheet_classification: { type: "string", description: "결제/정산/환불/슬롯구입정산/CPC리워드. 모르면 빈 문자열" },
        category: { type: "string", description: "CRM 조회 결과: 더널리 / 티제이웹 / 기타. 찾지 못하면 빈 문자열" },
      }, required: ["title", "amount"]},
    },
  },
  {
    type: "function", function: {
      name: "create_approval",
      description: "전자결재를 실제로 신청합니다. 사용자가 동의한 뒤에만 호출합니다.",
      parameters: { type: "object", properties: {
        type: { type: "string", description: "expense(정산요청·결제·환불·슬롯구입정산·CPC리워드 등 금전 지출 전반) / purchase(비품구입) / etc(기타 비금전)" },
        title: { type: "string", description: "결재 제목 (고객사명 등)" },
        content: { type: "string", description: "내용" },
        amount: { type: "number", description: "금액(원)" },
        date: { type: "string", description: "원장 기록 날짜 (YYYY-MM-DD). 오늘=today. 미지정 시 오늘" },
        payment_reason: { type: "string" },
        sheet_classification: { type: "string", description: "결제/정산/환불/슬롯구입정산/CPC리워드. 반드시 사용자에게 확인 후 입력" },
        category: { type: "string", description: "더널리 / 티제이웹 / 기타. query_clients 조회 결과 또는 사용자 확인 후 입력. 반드시 필요" },
        bank: { type: "string" },
        account_number: { type: "string" },
        account_holder_name: { type: "string" },
      }, required: ["type", "title", "amount", "sheet_classification", "category"]},
    },
  },
  {
    type: "function", function: {
      name: "approve_approval",
      description: "전자결재를 승인하거나 반려합니다. 팀장/C레벨 권한 필요.",
      parameters: { type: "object", properties: {
        approval_id: { type: "string" },
        action: { type: "string", description: "approve 또는 reject" },
        reject_reason: { type: "string", description: "반려 시 사유" },
      }, required: ["approval_id", "action"]},
    },
  },
  {
    type: "function", function: {
      name: "create_event",
      description: "캘린더에 일정을 등록합니다.",
      parameters: { type: "object", properties: {
        title: { type: "string" },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD (당일이면 start_date와 동일)" },
        description: { type: "string" },
        color: { type: "string", description: "blue / green / red / purple / orange" },
      }, required: ["title", "start_date"]},
    },
  },
  {
    type: "function", function: {
      name: "create_announcement",
      description: "공지사항을 등록합니다. C레벨/마스터 권한 필요.",
      parameters: { type: "object", properties: {
        title: { type: "string" },
        body: { type: "string", description: "내용" },
        is_important: { type: "boolean", description: "중요 공지 여부" },
      }, required: ["title"]},
    },
  },
  {
    type: "function", function: {
      name: "create_kanban_card",
      description: "칸반 보드에 카드를 추가합니다.",
      parameters: { type: "object", properties: {
        title: { type: "string" },
        description: { type: "string" },
        column: { type: "string", description: "todo / in_progress / done (기본: todo)" },
        assignee: { type: "string", description: "담당자 이름" },
        due_date: { type: "string", description: "마감일 YYYY-MM-DD" },
        priority: { type: "string", description: "high / medium / low" },
      }, required: ["title"]},
    },
  },
  {
    type: "function", function: {
      name: "update_kanban_card",
      description: "칸반 카드를 수정하거나 다른 컬럼으로 이동합니다. 먼저 query_kanban으로 ID를 확인하세요.",
      parameters: { type: "object", properties: {
        card_id: { type: "string" },
        title: { type: "string" },
        column: { type: "string", description: "todo / in_progress / done" },
        assignee: { type: "string" },
        due_date: { type: "string" },
        priority: { type: "string" },
        description: { type: "string" },
      }, required: ["card_id"]},
    },
  },
  {
    type: "function", function: {
      name: "delete_kanban_card",
      description: "칸반 카드를 삭제합니다.",
      parameters: { type: "object", properties: {
        card_id: { type: "string" },
      }, required: ["card_id"]},
    },
  },
  {
    type: "function", function: {
      name: "update_event",
      description: "캘린더 일정을 수정합니다. 먼저 query_events로 ID를 확인하세요.",
      parameters: { type: "object", properties: {
        event_id: { type: "string" },
        title: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" },
        description: { type: "string" },
        color: { type: "string" },
      }, required: ["event_id"]},
    },
  },
  {
    type: "function", function: {
      name: "delete_event",
      description: "캘린더 일정을 삭제합니다.",
      parameters: { type: "object", properties: {
        event_id: { type: "string" },
      }, required: ["event_id"]},
    },
  },
  {
    type: "function", function: {
      name: "update_announcement",
      description: "공지사항을 수정합니다. C레벨/마스터 권한 필요. 먼저 query_announcements로 ID를 확인하세요.",
      parameters: { type: "object", properties: {
        announcement_id: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        is_important: { type: "boolean" },
      }, required: ["announcement_id"]},
    },
  },
  {
    type: "function", function: {
      name: "delete_announcement",
      description: "공지사항을 삭제합니다. C레벨/마스터 권한 필요.",
      parameters: { type: "object", properties: {
        announcement_id: { type: "string" },
      }, required: ["announcement_id"]},
    },
  },
  {
    type: "function", function: {
      name: "create_client",
      description: "새 고객사(거래처)를 CRM에 등록합니다.",
      parameters: { type: "object", properties: {
        name: { type: "string", description: "상호명 (필수)" },
        category: { type: "string", description: "더널리 / 티제이웹 / 기타" },
        business_number: { type: "string" },
        representative: { type: "string" },
        address: { type: "string" },
        business_type: { type: "string" },
        business_item: { type: "string" },
        contact: { type: "string" },
      }, required: ["name"]},
    },
  },
  {
    type: "function", function: {
      name: "delete_client",
      description: "고객사를 삭제합니다. C레벨/마스터 권한 필요. 먼저 query_clients로 ID를 확인하세요.",
      parameters: { type: "object", properties: {
        client_id: { type: "string" },
      }, required: ["client_id"]},
    },
  },
];

// ── 툴 실행 ───────────────────────────────────────────────────────────────────
async function runTool(name: string, args: Record<string, unknown>, user: UserContext): Promise<string> {
  const supabase = createAdminClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const now = new Date();

  if (name === "get_lunch") {
    const menu = LUNCH_MENUS[Math.floor(Math.random() * LUNCH_MENUS.length)];
    return JSON.stringify({ 추천메뉴: menu });
  }

  // 운세
  if (name === "get_horoscope") {
    const f = generateDailyHoroscope({ name: user.name }, today);
    return JSON.stringify({ 총운: f.totalFortune, 재물운: `${f.wealthLuck}/5`, 업무운: `${f.workLuck}/5`, 행운의색: f.luckyColor, 행운의번호: f.lottoNumbers.join(", ") });
  }

  // ── 조회 ─────────────────────────────────────────────────────────────
  if (name === "query_finance_summary") {
    const yesterday = new Date(new Date(today).getTime() - 86400000).toISOString().slice(0, 10);
    const date = args.date === "today" ? today : args.date === "yesterday" ? yesterday : (args.date as string | undefined);
    const month = args.month === "current" ? today.slice(0, 7) : (args.month as string | undefined);
    let q = supabase.from("finance").select("type,amount,status");
    if (date) q = q.eq("date", date);
    else if (month) q = q.eq("month", month);
    const { data, error } = await q;
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "해당 기간 데이터가 없습니다.";
    const rows = data as { type: string; amount: number }[];
    const revRaw = rows.filter(r => r.type === "매출").reduce((s, r) => s + r.amount, 0);
    const expRaw = rows.filter(r => r.type === "매입").reduce((s, r) => s + r.amount, 0);
    return JSON.stringify({
      조회기간: date ?? month ?? "전체",
      매출액: Math.round(revRaw / 1.1),
      매출건수: rows.filter(r => r.type === "매출").length,
      매입액: Math.round(expRaw / 1.1),
      매입건수: rows.filter(r => r.type === "매입").length,
      매출총이익: Math.round(revRaw / 1.1) - Math.round(expRaw / 1.1),
    });
  }

  if (name === "query_finance") {
    let q = supabase.from("finance").select("date,month,type,amount,client_name,description,category,status").order("date", { ascending: false });
    const yesterday = new Date(new Date(today).getTime() - 86400000).toISOString().slice(0, 10);
    const date = args.date === "today" ? today : args.date === "yesterday" ? yesterday : (args.date as string | undefined);
    if (date) q = q.eq("date", date);
    const month = args.month === "current" ? today.slice(0, 7) : (args.month as string | undefined);
    if (month && !date) q = q.eq("month", month);
    if (args.type) {
      // DB 저장값은 한글(매출/매입). 영어·한글 모두 대응
      const typeMap: Record<string, string> = { "DEPOSIT": "매출", "입금": "매출", "WITHDRAWAL": "매입", "출금": "매입" };
      q = q.eq("type", typeMap[args.type as string] ?? args.type as string);
    }
    if (args.client_name) q = q.ilike("client_name", `%${args.client_name}%`);
    q = q.limit((args.limit as number) ?? 50);
    const { data, error } = await q;
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "해당 조건의 내역이 없습니다.";
    const total = (data as { amount: number }[]).reduce((s, r) => s + (r.amount ?? 0), 0);
    return JSON.stringify({ total_amount: total, count: data.length, items: data });
  }

  if (name === "query_leaves") {
    const dateFrom = args.date_from as string | undefined;
    const dateTo = args.date_to as string | undefined;
    const singleDate = args.date as string | undefined;

    // 조회는 전체 공개 — 권한 제한은 쓰기에만 적용
    let q1 = supabase.from("leave_requests").select("id,applicant_name,applicant_department,leave_type,start_date,end_date,days,status,reason");
    if (dateFrom && dateTo) q1 = q1.lte("start_date", dateTo).gte("end_date", dateFrom);
    else if (singleDate) q1 = q1.lte("start_date", singleDate).gte("end_date", singleDate);
    if (args.mine) q1 = q1.eq("applicant_id", user.userId);
    if (args.employee_name) q1 = q1.ilike("applicant_name", `%${args.employee_name}%`);
    if (args.status) q1 = q1.eq("status", args.status as string);
    const { data: d1 } = await q1.order("start_date", { ascending: false }).limit(30);

    let q2 = supabase.from("planned_leaves").select("id,applicant_name,applicant_department,leave_type,start_date,end_date,days,status");
    if (dateFrom && dateTo) q2 = q2.lte("start_date", dateTo).gte("end_date", dateFrom);
    else if (singleDate) q2 = q2.lte("start_date", singleDate).gte("end_date", singleDate);
    if (args.mine) q2 = q2.eq("applicant_id", user.userId);
    if (args.employee_name) q2 = q2.ilike("applicant_name", `%${args.employee_name}%`);
    const { data: d2 } = await q2.order("start_date", { ascending: false }).limit(30);

    const combined = [...(d1 ?? []), ...(d2 ?? [])];
    if (!combined.length) return "해당 조건의 휴가 내역이 없습니다.";
    return JSON.stringify(combined);
  }

  if (name === "query_approvals") {
    let q = supabase.from("approvals").select("id,title,type,requester_name,status,amount,created_at,reject_reason");
    if (args.mine) q = q.eq("requester_id", user.userId);
    if (args.status) q = q.eq("status", args.status as string);
    const { data, error } = await q.order("created_at", { ascending: false }).limit((args.limit as number) ?? 10);
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "해당 조건의 결재 내역이 없습니다.";
    return JSON.stringify(data);
  }

  if (name === "query_employees") {
    let q = supabase.from("employees").select("name,department,role,emp_number,email").eq("employment_status", "재직");
    if (args.name) q = q.ilike("name", `%${args.name}%`);
    if (args.department) q = q.ilike("department", `%${args.department}%`);
    if (args.role) q = q.eq("role", args.role as string);
    const { data, error } = await q;
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "해당 직원이 없습니다.";
    return JSON.stringify(data);
  }

  if (name === "query_clients") {
    let q = supabase.from("clients").select("id,name,category,contact,business_number,representative,address,aliases");
    if (args.name) {
      const kw = (args.name as string).replace(/'/g, "''");
      q = q.or(`name.ilike.%${kw}%,representative.ilike.%${kw}%`);
    }
    if (args.category) q = q.eq("category", args.category as string);
    const { data, error } = await q.order("name").limit(30);
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "해당 고객사가 없습니다.";
    return JSON.stringify(data);
  }

  if (name === "query_announcements") {
    let q = supabase.from("announcements").select("id,title,body,date,is_important,author_name").order("date", { ascending: false });
    if (args.important_only) q = q.eq("is_important", true);
    q = q.limit((args.limit as number) ?? 10);
    const { data, error } = await q;
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "공지사항이 없습니다.";
    return JSON.stringify(data);
  }

  if (name === "query_events") {
    const monthStart = `${today.slice(0, 7)}-01`;
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const fromDate = args.from === "today" ? today : args.from === "current_month_start" ? monthStart : (args.from as string | undefined);
    const toDate = args.to === "current_month_end" ? monthEnd : (args.to as string | undefined);
    let q = supabase.from("calendar_events").select("id,title,start_date,end_date,description,author_name").order("start_date");
    if (fromDate) q = q.gte("start_date", fromDate);
    if (toDate) q = q.lte("start_date", toDate);
    if (args.keyword) q = q.ilike("title", `%${args.keyword}%`);
    q = q.limit(30);
    const { data, error } = await q;
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "해당 일정이 없습니다.";
    return JSON.stringify(data);
  }

  if (name === "query_kanban") {
    let q = supabase.from("kanban_cards").select("id,title,description,column,assignee,priority,due_date").order("position");
    if (args.column) q = q.eq("column", args.column as string);
    if (args.assignee) q = q.ilike("assignee", `%${args.assignee}%`);
    const { data, error } = await q.limit(30);
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "해당 칸반 카드가 없습니다.";
    return JSON.stringify(data);
  }

  if (name === "query_assets") {
    let q = supabase.from("assets").select("id,name,category,purchase_date,amount,purpose,note");
    if (args.name) q = q.ilike("name", `%${args.name}%`);
    if (args.category) q = q.eq("category", args.category as string);
    const { data, error } = await q.order("purchase_date", { ascending: false }).limit(30);
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "해당 비품이 없습니다.";
    return JSON.stringify(data);
  }

  if (name === "query_bonus") {
    const EMP_BONUS_KEY: Record<string, string> = {
      "TNS-20190709": "donggyun", "TNS-20220117": "yongjun",
      "TNS-20250201": "jeongseop", "TNS-20210125": "jaemin", "TNS-20220801": "gyuseong",
    };
    const bonusKey = EMP_BONUS_KEY[user.empNumber];
    if (!bonusKey) return "성과급 대상이 아닙니다.";
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? "https://tnsgroupware.vercel.app"}/api/bonus/quarterly?empNumber=${user.empNumber}`);
    if (!res.ok) return "성과급 조회에 실패했습니다.";
    return JSON.stringify(await res.json());
  }

  if (name === "query_team_bonus") {
    if (user.role !== "C레벨") return "C레벨 권한이 필요합니다.";
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? "https://tnsgroupware.vercel.app"}/api/bonus/quarterly/team`);
    if (!res.ok) return "팀 성과급 조회에 실패했습니다.";
    return JSON.stringify(await res.json());
  }

  if (name === "query_annual_leaves") {
    const { data: granted } = await supabase.from("granted_leaves").select("user_id,user_name,year,days,type");
    const { data: used } = await supabase.from("leave_requests").select("applicant_id,applicant_name,days,status").eq("status", "승인_완료");
    if (!granted) return "연차 데이터가 없습니다.";
    const year = new Date().getFullYear();
    const grantedThisYear = (granted as Record<string, unknown>[]).filter((g) => g.year === year);
    const summary = grantedThisYear.map((g) => {
      const usedDays = (used as Record<string, unknown>[] ?? []).filter((u) => u.applicant_id === g.user_id).reduce((s, u) => s + (Number(u.days) || 0), 0);
      return { 이름: g.user_name, 발생: g.days, 사용: usedDays, 잔여: Number(g.days) - usedDays };
    });
    if (args.employee_name) {
      const filtered = summary.filter((s) => String(s.이름).includes(args.employee_name as string));
      return filtered.length ? JSON.stringify(filtered) : "해당 직원의 연차 정보가 없습니다.";
    }
    return JSON.stringify(summary);
  }

  if (name === "query_burnout_risk") {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: employees } = await supabase.from("employees").select("id,name,department").eq("employment_status", "재직");
    const { data: recentLeaves } = await supabase.from("leave_requests").select("applicant_id").eq("status", "승인_완료").gte("end_date", ninetyDaysAgo);
    if (!employees) return "직원 데이터가 없습니다.";
    const usedIds = new Set((recentLeaves ?? []).map((l: Record<string, unknown>) => l.applicant_id));
    const risks = (employees as Record<string, unknown>[]).filter((e) => !usedIds.has(e.id));
    if (!risks.length) return "최근 90일 내 모든 직원이 연차를 사용했습니다.";
    return JSON.stringify(risks.map((e) => ({ 이름: e.name, 부서: e.department })));
  }

  if (name === "query_projects") {
    let q = supabase.from("projects").select("id,title,start_date,end_date,progress,status").order("start_date");
    if (args.status) q = q.eq("status", args.status as string);
    const { data, error } = await q;
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "프로젝트가 없습니다.";
    return JSON.stringify(data);
  }

  if (name === "query_unmatched_finance") {
    const { data, error } = await supabase.from("finance").select("date,amount,description,client_name").eq("status", "UNMAPPED").order("date", { ascending: false }).limit(30);
    if (error) return `오류: ${error.message}`;
    if (!data?.length) return "미매핑 항목이 없습니다.";
    return JSON.stringify(data);
  }

  // ── 실행 ─────────────────────────────────────────────────────────────
  if (name === "create_leave") {
    const NEEDS_INTERMEDIATE = ["TNS-20220117", "TNS-20220801"];
    const status = NEEDS_INTERMEDIATE.includes(user.empNumber) ? "팀장_1차_승인_대기" : "C레벨_최종_승인_대기";
    const { data, error } = await supabase.from("leave_requests").insert({
      applicant_id: user.userId, applicant_name: user.name, applicant_department: user.department,
      leave_type: args.leave_type, start_date: args.start_date, end_date: args.end_date,
      days: args.days, reason: args.reason ?? "", status, requires_proof: false, proof_status: null,
    }).select().single();
    if (error) return `휴가 신청 실패: ${error.message}`;
    return `✅ 휴가가 신청되었습니다. (${args.leave_type}, ${args.start_date}~${args.end_date}, 상태: ${status})`;
  }

  if (name === "cancel_leave") {
    const { data: leave } = await supabase.from("leave_requests").select("*").eq("id", args.leave_id as string).single();
    if (!leave) return "해당 휴가를 찾을 수 없습니다.";
    const l = leave as Record<string, unknown>;
    if (l.applicant_id !== user.userId) return "본인의 휴가만 취소할 수 있습니다.";
    const isPending = ["C레벨_최종_승인_대기", "팀장_1차_승인_대기"].includes(l.status as string);
    if (isPending) {
      await supabase.from("leave_requests").delete().eq("id", args.leave_id as string);
      return "✅ 휴가 신청이 취소되었습니다.";
    } else if (l.status === "승인_완료") {
      await supabase.from("leave_requests").update({ status: "CANCELED" }).eq("id", args.leave_id as string);
      return "✅ 승인된 휴가가 취소 처리되었습니다.";
    }
    return "취소할 수 없는 상태입니다.";
  }

  if (name === "prepare_approval") {
    const todayStr = today;
    const dateStr = args.date === "today" || !args.date ? todayStr : String(args.date);
    const classification = String(args.sheet_classification ?? "").trim() || "[선택 필요]";
    const category = String(args.category ?? "").trim() || "[선택 필요]";
    const lines = [
      `1. 결재 제목: ${args.title}`,
      `2. 금액: ${Number(args.amount).toLocaleString()}원`,
      `3. 날짜: ${dateStr}`,
      `4. 분류: ${classification}`,
      `5. 카테고리: ${category}`,
    ];
    const missing: string[] = [];
    if (classification === "[선택 필요]") missing.push("분류(결제/정산/환불/슬롯구입정산/CPC리워드 중 선택)");
    if (category === "[선택 필요]") missing.push("카테고리(더널리/티제이웹/기타 중 선택)");
    const askLine = missing.length > 0
      ? `\n📌 ${missing.join(", ")}을 알려주시면 진행하겠습니다!`
      : `\n진행하시려면 "응/네/해줘"라고 말씀해 주세요! (동의 시 prepare_approval 재호출 없이 create_approval 바로 실행)`;
    return `아래 내용으로 결재를 신청할까요?\n\n${lines.join("\n")}${askLine}`;
  }

  if (name === "approve_leave") {
    const isAuthorized = user.role === "C레벨" || user.role === "팀장";
    if (!isAuthorized) return "승인 권한이 없습니다.";
    const newStatus = args.action === "approve" ? "승인_완료" : "반려";
    const { error } = await supabase.from("leave_requests").update({ status: newStatus }).eq("id", args.leave_id as string);
    if (error) return `처리 실패: ${error.message}`;
    return `✅ 휴가가 ${args.action === "approve" ? "승인" : "반려"}되었습니다.`;
  }

  if (name === "create_approval") {
    const financeDate = args.date === "today" || !args.date ? today : (args.date as string);
    const insert: Record<string, unknown> = {
      type: args.type, title: args.title, content: [args.content, args.category ? `카테고리: ${args.category}` : ""].filter(Boolean).join(" | "),
      amount: args.amount, requester_name: user.name, requester_id: user.userId, status: "pending",
      finance_date: financeDate,
    };
    if (args.payment_reason) insert.payment_reason = args.payment_reason;
    if (args.sheet_classification) insert.sheet_classification = args.sheet_classification;
    if (args.bank) insert.bank = args.bank;
    if (args.account_number) insert.account_number = args.account_number;
    if (args.account_holder_name) insert.account_holder_name = args.account_holder_name;

    const { data, error } = await supabase.from("approvals").insert(insert).select().single();
    if (error) return `결재 신청 실패: ${error.message}`;

    const approvalId = String((data as Record<string, unknown>).id);
    let financeNote = "";
    if (Number(args.amount) > 0) {
      const financeDate = args.date === "today" || !args.date ? today : (args.date as string);
      const { error: finErr } = await supabase.from("finance").insert({
        month: financeDate.slice(0, 7), date: financeDate, type: "매입", amount: args.amount, status: "UNMAPPED",
        description: `결재: ${args.title} | 신청자: ${user.name}`,
        client_name: args.title, approval_id: approvalId,
      } as Record<string, unknown>);
      if (finErr) financeNote = ` (원장 등록 실패: ${finErr.message})`;
      else financeNote = " + 원장에 미지급금으로 등록됨";
    }
    const apiKey = process.env.PUSHBULLET_API_KEY?.trim();
    if (apiKey) fetch("https://api.pushbullet.com/v2/pushes", { method: "POST", headers: { "Content-Type": "application/json", "Access-Token": apiKey }, body: JSON.stringify({ type: "note", title: "전자결재 새 건", body: `요청자: ${user.name}\n제목: ${args.title}\n금액: ${Number(args.amount).toLocaleString()}원` }) }).catch(() => {});
    return `✅ 결재 신청 완료 (${args.title}, ${Number(args.amount).toLocaleString()}원)${financeNote}`;
  }

  if (name === "approve_approval") {
    const isAuthorized = user.role === "C레벨" || user.role === "팀장";
    if (!isAuthorized) return "결재 권한이 없습니다.";
    const updateData: Record<string, unknown> = {
      status: args.action === "approve" ? "approved" : "rejected",
      approver_name: user.name,
      reviewed_at: new Date().toISOString(),
    };
    if (args.reject_reason) updateData.reject_reason = args.reject_reason;
    const { data, error } = await supabase.from("approvals").update(updateData).eq("id", args.approval_id as string).select().single();
    if (error) return `처리 실패: ${error.message}`;
    if (args.action === "approve" && data) {
      const d = data as Record<string, unknown>;
      if (d.type === "expense" || d.type === "purchase") {
        await supabase.from("finance").update({ status: "completed" }).eq("approval_id", String(d.id));
      }
    }
    return `✅ 결재가 ${args.action === "approve" ? "승인" : "반려"}되었습니다.`;
  }

  if (name === "create_event") {
    const { data, error } = await supabase.from("calendar_events").insert({
      title: args.title, start_date: args.start_date,
      end_date: args.end_date ?? args.start_date,
      description: args.description ?? null,
      color: args.color ?? "blue",
      author_id: user.userId, author_name: user.name,
    }).select().single();
    if (error) return `일정 등록 실패: ${error.message}`;
    return `✅ 일정이 등록되었습니다. (${args.title}, ${args.start_date})`;
  }

  if (name === "create_announcement") {
    const isAuthorized = user.role === "C레벨" || user.empNumber === "";
    if (!isAuthorized) return "공지사항 등록은 C레벨만 가능합니다.";
    const { error } = await supabase.from("announcements").insert({
      id: `ann-${Date.now()}`, title: args.title, body: args.body ?? null,
      date: today, is_important: args.is_important ?? false,
      author_id: user.userId, author_name: user.name,
    });
    if (error) return `공지 등록 실패: ${error.message}`;
    return `✅ 공지사항이 등록되었습니다. (${args.title})`;
  }

  if (name === "create_kanban_card") {
    const { data: existing } = await supabase.from("kanban_cards").select("position").eq("column", args.column ?? "todo").order("position", { ascending: false }).limit(1).single();
    const position = ((existing as Record<string, unknown> | null)?.position as number ?? 0) + 1000;
    const { error } = await supabase.from("kanban_cards").insert({
      title: args.title, description: args.description ?? null,
      column: args.column ?? "todo", assignee: args.assignee ?? null,
      due_date: args.due_date ?? null, priority: args.priority ?? "medium", position,
    });
    if (error) return `카드 추가 실패: ${error.message}`;
    return `✅ 칸반 카드가 추가되었습니다. (${args.title})`;
  }

  if (name === "update_kanban_card") {
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.column !== undefined) patch.column = args.column;
    if (args.assignee !== undefined) patch.assignee = args.assignee;
    if (args.due_date !== undefined) patch.due_date = args.due_date;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.description !== undefined) patch.description = args.description;
    const { error } = await supabase.from("kanban_cards").update(patch).eq("id", args.card_id as string);
    if (error) return `수정 실패: ${error.message}`;
    return `✅ 칸반 카드가 수정되었습니다.`;
  }

  if (name === "delete_kanban_card") {
    const { error } = await supabase.from("kanban_cards").delete().eq("id", args.card_id as string);
    if (error) return `삭제 실패: ${error.message}`;
    return `✅ 칸반 카드가 삭제되었습니다.`;
  }

  if (name === "update_event") {
    const patch: Record<string, unknown> = {};
    if (args.title) patch.title = args.title;
    if (args.start_date) patch.start_date = args.start_date;
    if (args.end_date) patch.end_date = args.end_date;
    if (args.description) patch.description = args.description;
    if (args.color) patch.color = args.color;
    const { error } = await supabase.from("calendar_events").update(patch).eq("id", args.event_id as string);
    if (error) return `수정 실패: ${error.message}`;
    return `✅ 일정이 수정되었습니다.`;
  }

  if (name === "delete_event") {
    const { error } = await supabase.from("calendar_events").delete().eq("id", args.event_id as string);
    if (error) return `삭제 실패: ${error.message}`;
    return `✅ 일정이 삭제되었습니다.`;
  }

  if (name === "update_announcement") {
    const isAuthorized = user.role === "C레벨" || user.empNumber === "";
    if (!isAuthorized) return "C레벨 권한이 필요합니다.";
    const patch: Record<string, unknown> = {};
    if (args.title) patch.title = args.title;
    if (args.body !== undefined) patch.body = args.body;
    if (args.is_important !== undefined) patch.is_important = args.is_important;
    const { error } = await supabase.from("announcements").update(patch).eq("id", args.announcement_id as string);
    if (error) return `수정 실패: ${error.message}`;
    return `✅ 공지사항이 수정되었습니다.`;
  }

  if (name === "delete_announcement") {
    const isAuthorized = user.role === "C레벨" || user.empNumber === "";
    if (!isAuthorized) return "C레벨 권한이 필요합니다.";
    const { error } = await supabase.from("announcements").delete().eq("id", args.announcement_id as string);
    if (error) return `삭제 실패: ${error.message}`;
    return `✅ 공지사항이 삭제되었습니다.`;
  }

  if (name === "create_client") {
    const { error } = await supabase.from("clients").insert({
      name: args.name, category: args.category ?? null,
      business_number: args.business_number ?? null, representative: args.representative ?? null,
      address: args.address ?? null, business_type: args.business_type ?? null,
      business_item: args.business_item ?? null, contact: args.contact ?? null,
    });
    if (error) return `고객사 등록 실패: ${error.message}`;
    return `✅ 고객사 "${args.name}"가 CRM에 등록되었습니다.`;
  }

  if (name === "delete_client") {
    const isAuthorized = user.role === "C레벨" || user.empNumber === "";
    if (!isAuthorized) return "C레벨 권한이 필요합니다.";
    const { error } = await supabase.from("clients").delete().eq("id", args.client_id as string);
    if (error) return `삭제 실패: ${error.message}`;
    return `✅ 고객사가 삭제되었습니다.`;
  }

  return "알 수 없는 툴입니다.";
}

export async function POST(req: Request) {
  const { messages, user } = await req.json() as {
    messages: OpenAI.Chat.ChatCompletionMessageParam[];
    user: UserContext;
  };

  const todayDisplay = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
  const todayKST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

  const systemPrompt = `당신은 TNS 그룹웨어 AI 도우미입니다.
오늘: ${todayDisplay} (${todayKST}) | 사용자: ${user.name} (${user.department}, ${user.role})

규칙:
1. 조회는 즉시 툴 호출. 재무 수치는 매번 새로 조회 (이전 답변 숫자 재사용 금지).
2. 쓰기(create_*/update_*/delete_*) 전에 내용 먼저 보여주고 동의 받은 후 실행.
3. "휴가 올려줘" "연차 신청해줘" 등은 ${user.name} 본인 휴가 신청으로 처리.
4. 입금/원장 내역은 items 전부 나열, total_amount 그대로 사용.
5. 숫자: xxx,xxx원 | 날짜: M월 d일 | 한국어 간결하게.
6. 일정 표시: 제목·날짜·내용·등록자 표시, 색상 언급 금지.
7. 매출총이익 = 매출액 - 매입액 (혼용 금지, query_finance_summary 결과 그대로 사용).

[결재 신청] query_clients → prepare_approval → 동의 확인 → create_approval (동의 후 prepare_approval 재호출 금지).`;

  const allMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  // 휴가자 조회 키워드 감지 → 자동으로 query_leaves 선실행 (신청/취소는 제외)
  const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
  const lastContent = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";
  const isLeaveWriteRequest = /올려줘|신청|취소|등록/.test(lastContent);
  const isLeaveQuery = /휴가|연차/.test(lastContent) && !isLeaveWriteRequest;
  if (isLeaveQuery) {
    // todayKST는 "YYYY-MM-DD" 문자열 → 로컬 자정으로 파싱 (UTC 변환 없음)
    const [ty, tm, td] = todayKST.split("-").map(Number);
    const todayDate = new Date(ty, tm - 1, td);
    const dow = todayDate.getDay(); // 0=일, 1=월 ... 6=토
    const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    let autoDateFrom: string | undefined;
    let autoDateTo: string | undefined;

    if (/다음\s*주/.test(lastContent)) {
      const daysToNextMon = dow === 0 ? 1 : 8 - dow;
      const nextMon = new Date(todayDate);
      nextMon.setDate(todayDate.getDate() + daysToNextMon);
      const nextFri = new Date(nextMon);
      nextFri.setDate(nextMon.getDate() + 4);
      autoDateFrom = fmtDate(nextMon);
      autoDateTo = fmtDate(nextFri);
    } else if (/이번\s*주/.test(lastContent)) {
      const daysToMon = dow === 0 ? -6 : 1 - dow;
      const thisMon = new Date(todayDate);
      thisMon.setDate(todayDate.getDate() + daysToMon);
      const thisFri = new Date(thisMon);
      thisFri.setDate(thisMon.getDate() + 4);
      autoDateFrom = fmtDate(thisMon);
      autoDateTo = fmtDate(thisFri);
    }

    const autoArgs: Record<string, unknown> = {};
    if (autoDateFrom && autoDateTo) { autoArgs.date_from = autoDateFrom; autoArgs.date_to = autoDateTo; }

    const autoResult = await runTool("query_leaves", autoArgs, user);
    const autoCallId = "auto-leave-0";
    allMessages.push({
      role: "assistant",
      content: null,
      tool_calls: [{ id: autoCallId, type: "function", function: { name: "query_leaves", arguments: JSON.stringify(autoArgs) } }],
    } as OpenAI.Chat.ChatCompletionMessageParam);
    allMessages.push({ role: "tool", tool_call_id: autoCallId, content: autoResult });
  }

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
