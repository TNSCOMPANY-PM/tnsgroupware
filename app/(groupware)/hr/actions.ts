"use server";

import { createClient } from "@/utils/supabase/server";
import { format } from "date-fns";

export type CreateEmployeeInput = {
  name: string;
  hireDate: Date;
  department: string;
  role: string;
  generatedId: string;
};

export async function createEmployee(
  data: CreateEmployeeInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { ok: false, error: "Supabase가 설정되지 않았습니다." };
  }
  const hireDateStr = format(data.hireDate, "yyyy-MM-dd");
  const email = `${data.generatedId.replace(/-/g, "").toLowerCase()}@example.com`;

  const { data: inserted, error } = await supabase
    .from("employees")
    .insert([
      {
        emp_number: data.generatedId,
        name: data.name.trim(),
        email: email || null,
        department: data.department,
        role: data.role,
        hire_date: hireDateStr,
      },
    ])
    .select("id")
    .single();

  if (error) {
    console.error("[createEmployee]", error);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: inserted?.id ?? "" };
}
