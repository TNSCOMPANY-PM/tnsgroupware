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

