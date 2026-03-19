"use client";

import React from "react";
import type { ContractRow } from "@/types/contract";
import type { SalaryContractContent, EmploymentContractContent, OathContractContent } from "@/types/contract";

function formatDateKo(s: string): string {
  if (!s) return "";
  const d = new Date(s);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}년 ${m}월 ${day}일`;
}

function formatBirthKo(s: string): string {
  if (!s) return "";
  return s.replace(/(\d{4})-(\d{2})-(\d{2})/, "$1년 $2월 $3일");
}

function formatWon(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

/** 연봉계약서 본문 */
export function SalaryContractBody({ content }: { content: SalaryContractContent }) {
  const birth = formatBirthKo(content.birthDate);
  return (
    <div className="space-y-4 text-slate-800">
      <h2 className="text-center text-lg font-bold">연봉계약서</h2>
      <p>
        티앤에스컴퍼니 (이하 &apos;A&apos;)와(과) <strong>{content.employeeName}</strong> (이하 &apos;B&apos;)은(는) 다음과 같이 연봉계약(이하 &apos;본 계약&apos;이라 한다.)을 체결하고, 이를 성실히 준수할 것을 약속하며 서명날인합니다.
      </p>
      <p><strong>제1조 (연봉계약기간)</strong></p>
      <p>연봉계약기간은 {formatDateKo(content.startDate)}부터 {formatDateKo(content.endDate)}까지로 한다.</p>
      <p><strong>제2조 (연봉의 구성)</strong></p>
      <p>&apos;B&apos;의 임금은 매월 1일부터 말일까지 산정하여 매월 10일에 &apos;B&apos; 명의의 예금계좌로 지급한다.</p>
      <p>&apos;B&apos;의 연봉은 {formatWon(content.totalAnnual)}이며, 구성항목은 다음과 같다.</p>
      <table className="w-full border-collapse border border-slate-300 text-sm">
        <tbody>
          <tr><td className="border border-slate-300 p-2">구분</td><td className="border border-slate-300 p-2">금액</td></tr>
          <tr><td className="border border-slate-300 p-2">월 지급액</td><td className="border border-slate-300 p-2">{formatWon(content.monthlyBase)}</td></tr>
          <tr><td className="border border-slate-300 p-2">기본급 (주휴수당포함)</td><td className="border border-slate-300 p-2">{formatWon(content.monthlyBase)}</td></tr>
          <tr><td className="border border-slate-300 p-2">계약 수당 포함</td><td className="border border-slate-300 p-2">식비 {content.monthlyMeal != null ? formatWon(content.monthlyMeal) : "-"}</td></tr>
        </tbody>
      </table>
      <p><strong>제3조 (기타)</strong></p>
      <p>본 계약은 제1조의 계약 기간의 임금에 적용하며, 기타 근로조건 관련 사항은 입사 시 체결한 근로계약서에 의한다.</p>
      <p className="mt-6 text-sm text-slate-600">
        {formatDateKo(content.startDate)} &nbsp; 회사명(A) 티앤에스컴퍼니 &nbsp; 생년월일(B) {birth}<br />
        직위/성명(A) 대표 / 김태정 &nbsp; 성명(B) {content.employeeName}
      </p>
    </div>
  );
}

/** 근로계약서 본문 (근로기준법 제17조 필수 기재사항 반영) */
export function EmploymentContractBody({ content }: { content: EmploymentContractContent }) {
  const birth = formatBirthKo(content.birthDate);
  return (
    <div className="space-y-4 text-slate-800">
      <h2 className="text-center text-lg font-bold">근로계약서</h2>
      <p>
        티앤에스컴퍼니 (이하 &apos;A&apos;)와(과) <strong>{content.employeeName}</strong> (이하 &apos;B&apos;)은(는) 다음과 같이 근로계약을 체결하고, 이를 성실히 준수할 것을 약속하며 서명날인합니다.
      </p>
      <p><strong>제1조 (근로계약기간)</strong></p>
      <p>근로계약기간은 {formatDateKo(content.startDate)}부터 기간의 정함이 없는 근로계약을 체결하기로 한다.</p>
      <p><strong>제2조 (수습 및 평가)</strong></p>
      <p>수습기간은 {formatDateKo(content.probationEndDate)} 까지로 급여지급률은 100% 이며, 기간 중 또는 기간 만료 시 평가에 따라 채용 불가능할 경우 본채용을 취소할 수 있다.</p>
      <p><strong>제3조 (근로장소 및 종사업무)</strong></p>
      <p>&apos;B&apos;의 근로장소는 회사 내이며, 종사업무(주요 업무)는 {content.mainWork} 로 한다. &apos;A&apos;는 업무 필요 시 근로장소와 종사업무를 변경할 수 있고 &apos;B&apos;는 이에 동의한다.</p>
      <p><strong>제4조 (소정근로시간)</strong></p>
      <p>&apos;B&apos;의 소정근로시간은 1일 8시간, 1주 40시간을 원칙으로 한다. 고정 출·퇴근제를 운영하며, 연장·휴일·야간근로가 필요한 경우 근로기준법에 따른 가산임금을 지급하거나 보상휴가로 대체한다.</p>
      <p><strong>제5조 (휴일)</strong></p>
      <p>&apos;B&apos;의 근로일은 월·화·수·목·금요일이며, 주휴일은 일요일로 한다. 관공서의 공휴일 및 대체공휴일은 근로기준법 및 관공서의 공휴일에 관한 규정에 따른다.</p>
      <p><strong>제6조 (임금의 구성·지급방법 및 지급시기)</strong></p>
      <p>&apos;B&apos;의 임금은 매월 1일부터 말일까지 산정하여 매월 10일 &apos;B&apos; 명의의 예금계좌로 지급한다. &apos;B&apos;의 연봉은 퇴직금을 별도로 하여 {formatWon(content.totalAnnual)}이며, 월 지급액(기본급 등) {formatWon(content.monthlyBase)}를 그 구성으로 한다. 계약시간을 넘어선 연장·휴일·야간근로에 대해서는 근로기준법에 따른 가산임금 또는 보상휴가로 지급한다.</p>
      <p><strong>제7조 (연차유급휴가)</strong></p>
      <p>연차유급휴가는 근로기준법 제60조 및 제60조의2에 따른다. 1년 미만 계속 근로자에게는 1개월 개근 시 1일, 1년 이상 계속 근로자에게는 법정 연차유급휴가를 부여하며, 그 외 사항은 취업규칙에 따른다.</p>
      <p className="mt-6 text-sm text-slate-600">
        {formatDateKo(content.startDate)} &nbsp; 회사명(A) 티앤에스컴퍼니 &nbsp; 생년월일(B) {birth}<br />
        직위/성명(A) 대표 / 김태정 &nbsp; 성명(B) {content.employeeName}
      </p>
    </div>
  );
}

/** 개인정보 이용동의서 본문 (요지만) */
export function PrivacyContractBody({ content }: { content: OathContractContent }) {
  const birth = formatBirthKo(content.birthDate);
  return (
    <div className="space-y-4 text-slate-800">
      <h2 className="text-center text-lg font-bold">개인정보의 수집·이용에 관한 동의서</h2>
      <p>1. <strong>{content.employeeName}</strong>은(는) 주식회사티앤에스컴퍼니의 근로자로서 인사관리상 개인정보의 수집·이용이 필요하다는 것을 이해하고 있고 다음과 같은 개인정보·민감정보·고유식별정보를 수집·이용하는 것에 동의합니다.</p>
      <p>(개인정보 항목, 수집·이용 목적, 보유기간 등은 별도 표와 같음)</p>
      <p>2. 위 서약인은 회사가 취득한 개인정보를 재직기간 동안 내부적으로 채용·승진 등 인사관리에 이용하고, 외부적으로 법령에 따라 관계기관 및 세무·노무 대행업체에 제공하는 것에 동의합니다.</p>
      <p className="mt-6 text-sm text-slate-600">
        위 서약인 &nbsp; 생년월일 {birth} &nbsp; 성명 {content.employeeName}
      </p>
    </div>
  );
}

/** 경업금지서약서 본문 (요지만) */
export function NonCompeteContractBody({ content }: { content: OathContractContent }) {
  const birth = formatBirthKo(content.birthDate);
  return (
    <div className="space-y-4 text-slate-800">
      <h2 className="text-center text-lg font-bold">경업금지서약서</h2>
      <p><strong>{content.employeeName}</strong>(이하 &apos;본인&apos;)은(는) 주식회사티앤에스컴퍼니(이하 &apos;회사&apos;)에 입사함에 있어 다음과 같이 서약합니다.</p>
      <p>1. 회사 및 본인이 보유한 기술·영업비밀, 고객정보 등을 제3자에게 이전·양도하거나 업무 외 목적으로 이용하지 않으며,</p>
      <p>2. 회사 사업과 동일·경쟁 업종의 회사 설립·취업·창업을 하지 아니할 것입니다. 이를 어길 때에는 가처분·손해배상·폐업 또는 업종변경을 요청할 수 있습니다.</p>
      <p>3. 본 서약사항은 회사에 근무하는 기간은 물론 퇴사 후 1년까지 유효합니다.</p>
      <p className="mt-6 text-sm text-slate-600">
        위 서약인 &nbsp; 생년월일 {birth} &nbsp; 성명 {content.employeeName}
      </p>
    </div>
  );
}

/** 비밀유지서약서 본문 (요지만) */
export function NdaContractBody({ content }: { content: OathContractContent }) {
  const birth = formatBirthKo(content.birthDate);
  return (
    <div className="space-y-4 text-slate-800">
      <h2 className="text-center text-lg font-bold">비밀유지서약서</h2>
      <p><strong>{content.employeeName}</strong>(이하 &apos;본인&apos;)은(는) 주식회사티앤에스컴퍼니(이하 &apos;회사&apos;)의 임직원으로서 회사의 영업비밀 보호와 관련하여 다음과 같이 서약합니다.</p>
      <p>제1조 (영업비밀) 본 서약서상 영업비밀이란 회사 업무수행과 관련하여 알게 되거나 제공받는 기술상·경영상의 제반 정보를 의미합니다.</p>
      <p>제2조 (비밀유지의무) 재직 중 알게 된 영업비밀을 사전 승인 없이 사용·복제·반출·전송하지 않으며, 퇴사 후에도 공개·누설하지 않겠습니다.</p>
      <p>제5조 (손해배상) 위반 시 부정경쟁방지 및 영업비밀보호에 관한 법률, 형법상 책임을 질 것을 확인합니다.</p>
      <p className="mt-6 text-sm text-slate-600">
        위 서약인 &nbsp; 생년월일 {birth} &nbsp; 성명 {content.employeeName}
      </p>
    </div>
  );
}

export function ContractDocument({ contract }: { contract: ContractRow }) {
  const c = contract.content as SalaryContractContent | EmploymentContractContent | OathContractContent;
  switch (contract.contract_type) {
    case "salary":
      return <SalaryContractBody content={c as SalaryContractContent} />;
    case "employment":
      return <EmploymentContractBody content={c as EmploymentContractContent} />;
    case "privacy":
      return <PrivacyContractBody content={c as OathContractContent} />;
    case "non_compete":
      return <NonCompeteContractBody content={c as OathContractContent} />;
    case "nda":
      return <NdaContractBody content={c as OathContractContent} />;
    default:
      return <p className="text-slate-500">계약 내용을 표시할 수 없습니다.</p>;
  }
}
