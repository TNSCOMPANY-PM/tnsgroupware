/** TNS 시트 정리 PDF 기준 문서 목록 (전체공개). 링크는 수정 화면에서 실제 URL로 변경 가능 */
export interface TnsSheetRow {
  id: string;
  section: "TNS관리시트" | "마케팅사업부" | "권한별정렬";
  documentName: string;
  permission: string;
  link: string;
  manager: string;
}

/** Google 스프레드시트 링크 형식. 수정 화면에서 실제 문서 ID로 교체 가능 */
const sheetLink = (docId: string) => `https://docs.google.com/spreadsheets/d/${docId}/edit`;

export const TNS_SHEET_ROWS: TnsSheetRow[] = [
  // TNS관리시트
  { id: "t1", section: "TNS관리시트", documentName: "2024매출통계", permission: "전체", link: sheetLink("1ABC2024sales"), manager: "박재민/김종환" },
  { id: "t2", section: "TNS관리시트", documentName: "목표설정&계획", permission: "총괄 이상", link: sheetLink("1ABCgoals"), manager: "박재민/-" },
  { id: "t3", section: "TNS관리시트", documentName: "제휴&오퍼월", permission: "팀장 이상", link: sheetLink("1ABCofferwall"), manager: "박재민/김정섭" },
  { id: "t4", section: "TNS관리시트", documentName: "TNS업무분장&보고체계", permission: "전체", link: sheetLink("1ABCTNSreport"), manager: "박재민/-" },
  { id: "t5", section: "TNS관리시트", documentName: "TNS업무계정", permission: "총괄 이상", link: sheetLink("1ABCTNSaccount"), manager: "김동균/-" },
  { id: "t6", section: "TNS관리시트", documentName: "팀장업무", permission: "팀장 이상", link: sheetLink("1ABCteamlead"), manager: "박재민/-" },
  { id: "t7", section: "TNS관리시트", documentName: "(총괄) 2025 인사평가표", permission: "총괄 이상", link: sheetLink("1ABC2025hr"), manager: "박재민/김정섭" },
  { id: "t8", section: "TNS관리시트", documentName: "(마케팅사업부) 2025 인사평가표", permission: "팀장 이상", link: sheetLink("1ABC2025mkt"), manager: "김정섭/김용준" },
  { id: "t9", section: "TNS관리시트", documentName: "(홈페이지사업부) 2025 인사평가표", permission: "팀장 이상", link: sheetLink("1ABC2025hp"), manager: "김동균" },
  { id: "t10", section: "TNS관리시트", documentName: "(콘텐츠사업부) 2025 인사평가표", permission: "팀장 이상", link: sheetLink("1ABC2025ct"), manager: "박재민" },
  { id: "t11", section: "TNS관리시트", documentName: "(경영지원) 2025 인사평가표", permission: "팀장 이상", link: sheetLink("1ABC2025support"), manager: "-" },
  { id: "t12", section: "TNS관리시트", documentName: "기획서 서식", permission: "팀장 이상", link: sheetLink("1ABCplanform"), manager: "박재민/-" },
  { id: "t13", section: "TNS관리시트", documentName: "견적서 서식", permission: "팀장 이상", link: sheetLink("1ABCquoteform"), manager: "박재민" },
  { id: "t14", section: "TNS관리시트", documentName: "회계관련 서식", permission: "팀장 이상", link: sheetLink("1ABCaccountform"), manager: "박재민" },
  { id: "t15", section: "TNS관리시트", documentName: "티제이웹 프로젝트 일정표", permission: "전체", link: sheetLink("1ABCtjschedule"), manager: "김동균" },
  { id: "t16", section: "TNS관리시트", documentName: "제작일정", permission: "전체", link: sheetLink("1ABCprod"), manager: "김동균" },
  { id: "t17", section: "TNS관리시트", documentName: "티제이웹 정기결제 리스트", permission: "전체", link: sheetLink("1ABCtjpay"), manager: "김동균" },
  { id: "t18", section: "TNS관리시트", documentName: "티제이웹 업무계정", permission: "전체", link: sheetLink("1ABCtjaccount"), manager: "김동균" },
  // 마케팅사업부 관리시트
  { id: "m1", section: "마케팅사업부", documentName: "(1팀)트래픽관리시트", permission: "전체", link: sheetLink("1ABCtraffic"), manager: "김용준/심규성" },
  { id: "m2", section: "마케팅사업부", documentName: "(2팀)종합마케팅관리시트", permission: "전체", link: sheetLink("1ABCmkt2"), manager: "김정섭/홍성빈" },
  { id: "m3", section: "마케팅사업부", documentName: "타수테스트", permission: "전체", link: sheetLink("1ABCtasu"), manager: "김용준/박재민" },
  { id: "m4", section: "마케팅사업부", documentName: "순위보장 관리시트", permission: "전체", link: sheetLink("1ABCrank"), manager: "김용준/정예린" },
  { id: "m5", section: "마케팅사업부", documentName: "널리회원 순위전략 시트", permission: "전체", link: sheetLink("1ABCnully"), manager: "심규성/김정섭" },
  { id: "m6", section: "마케팅사업부", documentName: "퍼포먼스마케팅 시트", permission: "팀장 이상", link: sheetLink("1ABCperf"), manager: "박재민/-" },
  { id: "m7", section: "마케팅사업부", documentName: "마케팅 1팀 업무계정", permission: "팀장 이상", link: sheetLink("1ABCmkt1acc"), manager: "김동균/김용준" },
  { id: "m8", section: "마케팅사업부", documentName: "마케팅 2팀 업무계정", permission: "팀장 이상", link: sheetLink("1ABCmkt2acc"), manager: "김동균/김정섭" },
  { id: "m9", section: "마케팅사업부", documentName: "신사업부 관리시트", permission: "-", link: sheetLink("1ABCnewbiz"), manager: "박재민" },
  { id: "m10", section: "마케팅사업부", documentName: "TNS컴퍼니 26.02월 운영보고", permission: "-", link: sheetLink("1ABC2602report"), manager: "박재민" },
  { id: "m11", section: "마케팅사업부", documentName: "TNS컴퍼니 26.01월 운영보고", permission: "-", link: sheetLink("1ABC2601report"), manager: "박재민" },
  { id: "m12", section: "마케팅사업부", documentName: "26년 1분기 팀별 목표", permission: "-", link: sheetLink("1ABC26Q1"), manager: "박재민" },
  // 권한별 정렬
  { id: "k1", section: "권한별정렬", documentName: "TNS업무계정", permission: "총괄 이상", link: sheetLink("1ABCTNSaccount"), manager: "김동균/-" },
  { id: "k2", section: "권한별정렬", documentName: "목표설정&계획", permission: "총괄 이상", link: sheetLink("1ABCgoals"), manager: "박재민" },
  { id: "k3", section: "권한별정렬", documentName: "제휴&오퍼월", permission: "팀장 이상", link: sheetLink("1ABCofferwall"), manager: "박재민/김정섭" },
  { id: "k4", section: "권한별정렬", documentName: "(총괄) 2025 인사평가표", permission: "총괄 이상", link: sheetLink("1ABC2025hr"), manager: "박재민/김정섭" },
  { id: "k5", section: "권한별정렬", documentName: "(마케팅사업부) 2025 인사평가표", permission: "팀장 이상", link: sheetLink("1ABC2025mkt"), manager: "김정섭/김용준" },
  { id: "k6", section: "권한별정렬", documentName: "퍼포먼스마케팅 시트", permission: "팀장 이상", link: sheetLink("1ABCperf"), manager: "박재민/-" },
  { id: "k7", section: "권한별정렬", documentName: "마케팅 1팀 업무계정", permission: "팀장 이상", link: sheetLink("1ABCmkt1acc"), manager: "김동균/김용준" },
  { id: "k8", section: "권한별정렬", documentName: "마케팅 2팀 업무계정", permission: "팀장 이상", link: sheetLink("1ABCmkt2acc"), manager: "김동균/김정섭" },
  { id: "k9", section: "권한별정렬", documentName: "(1팀)트래픽관리시트", permission: "전체", link: sheetLink("1ABCtraffic"), manager: "김용준/심규성" },
  { id: "k10", section: "권한별정렬", documentName: "(2팀)종합마케팅관리시트", permission: "전체", link: sheetLink("1ABCmkt2"), manager: "김정섭/홍성빈" },
  { id: "k11", section: "권한별정렬", documentName: "견적서 서식", permission: "팀장 이상", link: sheetLink("1ABCquoteform"), manager: "박재민" },
  { id: "k12", section: "권한별정렬", documentName: "회계관련 서식", permission: "팀장 이상", link: sheetLink("1ABCaccountform"), manager: "박재민" },
];
