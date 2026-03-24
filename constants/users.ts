export type UserRole = "C레벨" | "팀장" | "사원";
export type Department = "경영" | "마케팅사업부";
export type EmploymentStatus = "재직" | "휴직" | "퇴직";

/** 카드/프로필 직위 표기용 (총괄은 권한은 팀장 레벨) */
export type PositionDisplay = "총괄" | "팀장" | "사원";

export interface User {
  id: string;
  name: string;
  position: string;
  department: Department;
  role: UserRole;
  /** 카드·프로필에 표시할 직위 (총괄/팀장/사원). 없으면 role 사용 */
  positionDisplay?: PositionDisplay;
  /** 카드·프로필에 표시할 부서명 (예: 경영지원, 티제이웹). 없으면 department 사용 */
  displayDepartment?: string;
  joinDate?: string;
  email?: string;
  phone?: string;
  employmentStatus: EmploymentStatus;
  /** 사번 (HR DB 직원일 때 프로필 이름/사번 매칭용) */
  emp_number?: string;
}

export const DUMMY_USERS: User[] = [
  {
    id: "1",
    name: "김태정",
    position: "CEO",
    department: "경영",
    role: "C레벨",
    employmentStatus: "재직",
    email: "taejeong@tns.kr",
    phone: "010-1234-5001",
    emp_number: "TNS-20161104",
    joinDate: "2016.11.04",
  },
  {
    id: "2",
    name: "한혜경",
    position: "CFO",
    department: "경영",
    role: "C레벨",
    employmentStatus: "재직",
    email: "hyekyung@tns.kr",
    phone: "010-1234-5002",
    emp_number: "TNS-20170102",
    joinDate: "2017.01.02",
  },
  {
    id: "3",
    name: "김동균",
    position: "맞춤형 홈페이지 제작",
    department: "마케팅사업부",
    role: "팀장",
    positionDisplay: "팀장",
    displayDepartment: "티제이웹",
    joinDate: "2019.07.09",
    employmentStatus: "재직",
    email: "dongkyun@tns.kr",
    phone: "010-7197-2922",
  },
  {
    id: "4",
    name: "김용준",
    position: "이커머스 운영 관리",
    department: "마케팅사업부",
    role: "팀장",
    positionDisplay: "팀장",
    displayDepartment: "마케팅사업부",
    joinDate: "2022.01.17",
    employmentStatus: "재직",
    email: "yongjun@tns.kr",
    phone: "010-4032-9187",
  },
  {
    id: "5",
    name: "김정섭",
    position: "이커머스 운영 관리",
    department: "마케팅사업부",
    role: "팀장",
    positionDisplay: "총괄",
    displayDepartment: "마케팅사업부",
    joinDate: "2025.02.01",
    employmentStatus: "재직",
    email: "jeongseop@tns.kr",
    phone: "010-7167-4881",
  },
  {
    id: "6",
    name: "박재민",
    position: "경영지원",
    department: "마케팅사업부",
    role: "팀장",
    positionDisplay: "총괄",
    displayDepartment: "경영지원",
    joinDate: "2021.01.25",
    employmentStatus: "재직",
    email: "jaemin@tns.kr",
    phone: "010-6604-5755",
  },
  {
    id: "7",
    name: "심규성",
    position: "이커머스 운영 관리",
    department: "마케팅사업부",
    role: "사원",
    positionDisplay: "사원",
    displayDepartment: "마케팅사업부",
    joinDate: "2022.08.01",
    employmentStatus: "재직",
    email: "kyusung@tns.kr",
    phone: "010-2822-8057",
  },
];
