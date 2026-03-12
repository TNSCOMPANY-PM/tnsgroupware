export interface EmployeeDetailProfile {
  id: string;
  name: string;
  position: string;
  department: string;
  team?: string;
  role: string;
  avatarUrl?: string;
  organization: {
    department: string;
    team: string;
    location: string;
    position: string;
    jobTitle?: string;
  };
  personal: {
    name: string;
    residentId: string;
    passportNo?: string;
    bankAccount?: string;
    address: string;
    phone: string;
    email: string;
    gender: string;
    birthDate: string;
    nationality: string;
    emergencyContact: string;
  };
  employment: {
    type: string;
    joinDate: string;
    probationStart?: string;
    probationEnd?: string;
    probationProgress?: number;
    tenure: string;
    tenureDays: number;
    tenureMaxDays: number;
    status: string;
    contractStart?: string;
    contractEnd?: string;
  };
  payroll: {
    salaryAccount: string;
    salaryType: string;
  };
  leave: {
    granted: number;
    used: number;
    remaining: number;
  };
  sidebar: {
    reportLine: string;
    reportDepartment: string;
    directManager: string;
    phone: string;
    email: string;
    internalPhone?: string;
    address: string;
  };
  jobTags: string[];
}

/** 플렉스(기본 정보) 기준 · 박재민 — 확정 */
export const PROFILE_JAEMIN: EmployeeDetailProfile = {
  id: "6",
  name: "박재민",
  position: "경영지원",
  department: "마케팅사업부",
  team: "마케팅사업부",
  role: "팀장",
  organization: {
    department: "마케팅사업부",
    team: "마케팅사업부",
    location: "서울 본사",
    position: "경영지원",
  },
  personal: {
    name: "박재민",
    residentId: "970816-*******",
    bankAccount: "신한은행 110369905465",
    address: "서울특별시 양천구 신정로7길 75 (신정동, 이든채) 103동 608호 (우 08049)",
    phone: "+82-10-6604-5755",
    email: "barnard9708@gmail.com",
    gender: "남",
    birthDate: "1997년 8월 16일",
    nationality: "대한민국 (KOR)",
    emergencyContact: "-",
  },
  employment: {
    type: "정규직",
    joinDate: "2021년 1월 25일",
    probationStart: "2021년 1월 25일",
    probationEnd: "2021년 4월 25일",
    probationProgress: 100,
    tenure: "5년 1개월 16일",
    tenureDays: 1893,
    tenureMaxDays: 1825,
    status: "재직",
    contractStart: "2024년 7월 1일",
    contractEnd: "-",
  },
  payroll: {
    salaryAccount: "신한은행 110369905465",
    salaryType: "연봉",
  },
  leave: {
    granted: 18,
    used: 2,
    remaining: 16,
  },
  sidebar: {
    reportLine: "-",
    reportDepartment: "마케팅사업부",
    directManager: "-",
    phone: "+82-10-6604-5755",
    email: "barnard9708@gmail.com",
    address: "서울특별시 양천구 신정로7길 75 (신정동, 이든채) 103동 608호",
  },
  jobTags: ["경영지원", "기획", "운영"],
};

/** PDF(구성원프로필) 반영 · 김동균 — 확정 */
export const PROFILE_KIM_DONGKYUN: EmployeeDetailProfile = {
  id: "3",
  name: "김동균",
  position: "맞춤형 홈페이지 제작",
  department: "마케팅사업부",
  team: "마케팅사업부",
  role: "팀장",
  organization: {
    department: "마케팅사업부",
    team: "마케팅사업부",
    location: "서울 본사",
    position: "팀장",
  },
  personal: {
    name: "김동균",
    residentId: "********-*******",
    bankAccount: "-",
    address: "-",
    phone: "010-7197-2922",
    email: "rlaehdrbs1231@naver.com",
    gender: "-",
    birthDate: "1994년 9월 7일",
    nationality: "대한민국 (KOR)",
    emergencyContact: "-",
  },
  employment: {
    type: "정규직",
    joinDate: "2019년 7월 9일",
    probationStart: "2019년 7월 9일",
    probationEnd: "2019년 9월 30일",
    probationProgress: 100,
    tenure: "6년 9개월",
    tenureDays: 2464,
    tenureMaxDays: 1825,
    status: "재직",
    contractStart: "2025년 2월 1일",
    contractEnd: "-",
  },
  payroll: {
    salaryAccount: "-",
    salaryType: "연봉",
  },
  leave: { granted: 18, used: 0, remaining: 18 },
  sidebar: {
    reportLine: "-",
    reportDepartment: "마케팅사업부",
    directManager: "-",
    phone: "010-7197-2922",
    email: "rlaehdrbs1231@naver.com",
    address: "-",
  },
  jobTags: ["맞춤형 홈페이지 제작", "팀장"],
};

/** PDF(구성원프로필) 반영 · 심규성 — 확정 */
export const PROFILE_SIM_KYUSUNG: EmployeeDetailProfile = {
  id: "7",
  name: "심규성",
  position: "이커머스 운영 관리",
  department: "마케팅사업부",
  team: "마케팅사업부",
  role: "선임",
  organization: {
    department: "마케팅사업부",
    team: "마케팅사업부",
    location: "서울 본사",
    position: "선임",
  },
  personal: {
    name: "심규성",
    residentId: "********-*******",
    bankAccount: "-",
    address: "-",
    phone: "010-2822-8057",
    email: "sadoshim@naver.com",
    gender: "-",
    birthDate: "1999년 9월 12일",
    nationality: "대한민국 (KOR)",
    emergencyContact: "-",
  },
  employment: {
    type: "정규직",
    joinDate: "2022년 8월 1일",
    probationStart: "2022년 8월 1일",
    probationEnd: "2022년 10월 31일",
    probationProgress: 100,
    tenure: "3년 8개월",
    tenureDays: 1349,
    tenureMaxDays: 1825,
    status: "재직",
    contractStart: "2024년 7월 1일",
    contractEnd: "-",
  },
  payroll: {
    salaryAccount: "-",
    salaryType: "연봉",
  },
  leave: { granted: 15, used: 0, remaining: 15 },
  sidebar: {
    reportLine: "-",
    reportDepartment: "마케팅사업부",
    directManager: "-",
    phone: "010-2822-8057",
    email: "sadoshim@naver.com",
    address: "-",
  },
  jobTags: ["이커머스 운영 관리", "선임"],
};

/** PDF(구성원프로필) 반영 · 김정섭 — 확정 */
export const PROFILE_KIM_JEONGSEOP: EmployeeDetailProfile = {
  id: "5",
  name: "김정섭",
  position: "이커머스 운영 관리",
  department: "마케팅사업부",
  team: "마케팅사업부",
  role: "팀장",
  organization: {
    department: "마케팅사업부",
    team: "마케팅사업부",
    location: "서울 본사",
    position: "총괄팀장",
    jobTitle: "팀장",
  },
  personal: {
    name: "김정섭",
    residentId: "********-*******",
    bankAccount: "-",
    address: "-",
    phone: "010-7167-4881",
    email: "seops1118@naver.com",
    gender: "-",
    birthDate: "1993년 11월 18일",
    nationality: "대한민국 (KOR)",
    emergencyContact: "-",
  },
  employment: {
    type: "정규직",
    joinDate: "2025년 2월 1일",
    tenure: "1년 2개월",
    tenureDays: 405,
    tenureMaxDays: 1825,
    status: "재직",
    contractStart: "2025년 2월 1일",
    contractEnd: "-",
  },
  payroll: {
    salaryAccount: "-",
    salaryType: "월급",
  },
  leave: { granted: 15, used: 0, remaining: 15 },
  sidebar: {
    reportLine: "-",
    reportDepartment: "마케팅사업부",
    directManager: "-",
    phone: "010-7167-4881",
    email: "seops1118@naver.com",
    address: "-",
  },
  jobTags: ["이커머스 운영 관리", "총괄팀장", "팀장"],
};

/** PDF(구성원프로필_김용준_2026-03-12 (1).pdf) 반영 · 김용준 — 확정 */
export const PROFILE_KIM_YONGJUN: EmployeeDetailProfile = {
  id: "4",
  name: "김용준",
  position: "이커머스 운영 관리",
  department: "마케팅사업부",
  team: "마케팅사업부",
  role: "팀장",
  organization: {
    department: "마케팅사업부",
    team: "마케팅사업부",
    location: "서울 본사",
    position: "팀장",
  },
  personal: {
    name: "김용준",
    residentId: "********-*******",
    bankAccount: "-",
    address: "-",
    phone: "010-4032-9187",
    email: "dydwns9187@naver.com",
    gender: "-",
    birthDate: "1999년 11월 19일",
    nationality: "대한민국 (KOR)",
    emergencyContact: "-",
  },
  employment: {
    type: "정규직",
    joinDate: "2022년 1월 17일",
    probationStart: "2022년 1월 17일",
    probationEnd: "2022년 4월 16일",
    probationProgress: 100,
    tenure: "4년 2개월",
    tenureDays: 1516,
    tenureMaxDays: 1825,
    status: "재직",
    contractStart: "2024년 7월 1일",
    contractEnd: "-",
  },
  payroll: { salaryAccount: "-", salaryType: "연봉" },
  leave: { granted: 15, used: 0, remaining: 15 },
  sidebar: {
    reportLine: "-",
    reportDepartment: "마케팅사업부",
    directManager: "-",
    phone: "010-4032-9187",
    email: "dydwns9187@naver.com",
    address: "-",
  },
  jobTags: ["이커머스 운영 관리", "팀장"],
};

import type { User } from "./users";

const PROFILES_BY_NAME: Record<string, EmployeeDetailProfile> = {
  박재민: PROFILE_JAEMIN,
  김동균: PROFILE_KIM_DONGKYUN,
  심규성: PROFILE_SIM_KYUSUNG,
  김정섭: PROFILE_KIM_JEONGSEOP,
  김용준: PROFILE_KIM_YONGJUN,
};

/** 사번으로 상세 프로필 조회 (DB 직원 카드 클릭 시 매칭용) */
const PROFILES_BY_EMP_NUMBER: Record<string, EmployeeDetailProfile> = {
  "TNS-20210125": PROFILE_JAEMIN,
  "TNS-20190709": PROFILE_KIM_DONGKYUN,
  "TNS-20220801": PROFILE_SIM_KYUSUNG,
  "TNS-20250201": PROFILE_KIM_JEONGSEOP,
  "TNS-20220117": PROFILE_KIM_YONGJUN,
};

export function getProfileByUserId(userId: string): EmployeeDetailProfile | null {
  if (userId === "6") return PROFILE_JAEMIN;
  return null;
}

/** 이름으로 상세 프로필 조회 (PDF 반영 데이터). */
export function getProfileByName(name: string): EmployeeDetailProfile | null {
  const key = (name ?? "").trim();
  if (!key) return null;
  return PROFILES_BY_NAME[key] ?? null;
}

/** 사번으로 상세 프로필 조회 (대소문자 무시). */
export function getProfileByEmpNumber(empNumber: string): EmployeeDetailProfile | null {
  const key = (empNumber ?? "").trim();
  if (!key) return null;
  return (
    PROFILES_BY_EMP_NUMBER[key] ??
    PROFILES_BY_EMP_NUMBER[key.toUpperCase()] ??
    null
  );
}

/** Supabase/API 응답에서 직원 필드 읽기 (snake_case / camelCase 둘 다 허용) */
function normalizeEmp(emp: Record<string, unknown>): {
  id: string;
  emp_number: string;
  name: string;
  department: string;
  role: string;
  hire_date: string;
  email: string | null;
} {
  const id = String(emp.id ?? emp.Id ?? "");
  const emp_number = String(emp.emp_number ?? emp.empNumber ?? "").trim();
  const name = String(emp.name ?? "").trim();
  const department = String(emp.department ?? "");
  const role = String(emp.role ?? "");
  const hire_date = String(emp.hire_date ?? emp.hireDate ?? "");
  const email = emp.email != null ? String(emp.email) : null;
  return { id, emp_number, name, department, role, hire_date, email };
}

/** 직원(Employee) 기준으로 상세 프로필 반환. HR 카드 클릭 시 사번·이름으로 PDF 프로필 매칭 후 시트 전체(인사/개인/고용 정보)에 사용. */
export function getProfileForEmployee(
  emp: Record<string, unknown> | { id: string; emp_number: string; name: string; department: string; role: string; hire_date: string; email: string | null }
): EmployeeDetailProfile {
  const e = normalizeEmp(emp as Record<string, unknown>);
  const byEmp = e.emp_number ? getProfileByEmpNumber(e.emp_number) : null;
  if (byEmp) return { ...byEmp, id: e.id };
  const byName = e.name ? getProfileByName(e.name) : null;
  if (byName) return { ...byName, id: e.id };
  const joinDate =
    e.hire_date
      ? new Date(e.hire_date).toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "-";
  const tenureDays = e.hire_date
    ? Math.floor(
        (Date.now() - new Date(e.hire_date).getTime()) / (1000 * 60 * 60 * 24)
      )
    : 0;
  const dept = e.department === "경영" ? "경영" : "마케팅사업부";
  return {
    id: e.id,
    name: e.name,
    position: e.role,
    department: e.department,
    role: e.role,
    organization: {
      department: e.department,
      team: dept,
      location: "서울 본사",
      position: e.role,
    },
    personal: {
      name: e.name,
      residentId: "********-*******",
      address: "-",
      phone: "-",
      email: e.email ?? "-",
      gender: "-",
      birthDate: "-",
      nationality: "대한민국 (KOR)",
      emergencyContact: "-",
    },
    employment: {
      type: "정규직",
      joinDate,
      tenure: "-",
      tenureDays,
      tenureMaxDays: 1825,
      status: "재직",
    },
    payroll: { salaryAccount: "-", salaryType: "월급" },
    leave: { granted: 15, used: 0, remaining: 15 },
    sidebar: {
      reportLine: "-",
      reportDepartment: e.department,
      directManager: "-",
      phone: "-",
      email: e.email ?? "-",
      address: "-",
    },
    jobTags: [e.role],
  };
}

export function getProfileForUser(user: User): EmployeeDetailProfile {
  const existing = getProfileByUserId(user.id);
  if (existing) return { ...existing, id: user.id };

  if (user.emp_number) {
    const byEmp = getProfileByEmpNumber(user.emp_number);
    if (byEmp) return { ...byEmp, id: user.id };
  }
  const byName = getProfileByName(user.name);
  if (byName) return { ...byName, id: user.id };

  const joinDate = user.joinDate
    ? new Date(user.joinDate.replace(/\./g, "-")).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "-";
  const tenureDays = user.joinDate
    ? Math.floor(
        (Date.now() - new Date(user.joinDate.replace(/\./g, "-")).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 0;

  return {
    id: user.id,
    name: user.name,
    position: user.position,
    department: user.department,
    role: user.role,
    organization: {
      department: user.department,
      team: "-",
      location: "서울 본사",
      position: user.position,
    },
    personal: {
      name: user.name,
      residentId: "********-*******",
      address: "-",
      phone: user.phone ?? "-",
      email: user.email ?? "-",
      gender: "-",
      birthDate: "-",
      nationality: "대한민국 (KOR)",
      emergencyContact: "-",
    },
    employment: {
      type: "정규직",
      joinDate,
      tenure: "-",
      tenureDays,
      tenureMaxDays: 1825,
      status: user.employmentStatus,
    },
    payroll: {
      salaryAccount: "-",
      salaryType: "월급",
    },
    leave: {
      granted: 15,
      used: 0,
      remaining: 15,
    },
    sidebar: {
      reportLine: "-",
      reportDepartment: user.department,
      directManager: "-",
      phone: user.phone ?? "-",
      email: user.email ?? "-",
      address: "-",
    },
    jobTags: [user.position],
  };
}
