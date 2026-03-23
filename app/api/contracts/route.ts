import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import type { ContractInsert } from "@/types/contract";

/** GET: employee_id 쿼리로 해당 직원 계약 목록 조회 / all=true이면 전체 (C레벨용) */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employee_id");
    const all = searchParams.get("all") === "true";
    const statusFilter = searchParams.get("status");
    const typeFilter = searchParams.get("type");

    if (!employeeId && !all) {
      return NextResponse.json({ error: "employee_id or all=true required" }, { status: 400 });
    }
    const supabase = await createClient();
    let query = supabase
      .from("contracts")
      .select("*")
      .order("created_at", { ascending: false });

    if (employeeId) query = query.eq("employee_id", employeeId);
    if (statusFilter) query = query.eq("status", statusFilter);
    if (typeFilter) {
      const types = typeFilter.split(",").map((t) => t.trim());
      query = query.in("contract_type", types);
    }

    const { data, error } = await query;

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("contracts") && (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("relation"))) {
        return NextResponse.json(
          { error: "contracts 테이블이 없습니다. Supabase 대시보드 → SQL Editor에서 supabase-contracts.sql을 실행해 주세요.", code: "CONTRACTS_TABLE_MISSING" },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const msg = err.message ?? "";
    if (msg.includes("contracts") && (msg.includes("schema cache") || msg.includes("does not exist"))) {
      return NextResponse.json(
        { error: "contracts 테이블이 없습니다. Supabase 대시보드 → SQL Editor에서 supabase-contracts.sql을 실행해 주세요.", code: "CONTRACTS_TABLE_MISSING" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST: 계약서 발송 (pending 상태로 INSERT) */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ContractInsert;
    const { employee_id, contract_type, content } = body;
    if (!employee_id || !contract_type || content == null) {
      return NextResponse.json(
        { error: "employee_id, contract_type, content required" },
        { status: 400 }
      );
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("contracts")
      .insert({
        employee_id,
        contract_type,
        content: content as object,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("contracts") && (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("relation"))) {
        return NextResponse.json(
          { error: "contracts 테이블이 없습니다. Supabase 대시보드 → SQL Editor에서 supabase-contracts.sql을 실행해 주세요.", code: "CONTRACTS_TABLE_MISSING" },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const msg = err.message ?? "";
    if (msg.includes("contracts") && (msg.includes("schema cache") || msg.includes("does not exist"))) {
      return NextResponse.json(
        { error: "contracts 테이블이 없습니다. Supabase 대시보드 → SQL Editor에서 supabase-contracts.sql을 실행해 주세요.", code: "CONTRACTS_TABLE_MISSING" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
