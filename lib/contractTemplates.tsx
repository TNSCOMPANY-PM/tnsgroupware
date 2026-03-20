"use client";

import React from "react";
import type { ContractRow } from "@/types/contract";
import type { SalaryContractContent, EmploymentContractContent, OathContractContent } from "@/types/contract";

/* ─── helpers ────────────────────────────────────────────────────── */
function formatDateKo(s: string): string {
  if (!s) return "";
  const d = new Date(s);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatBirthKo(s: string): string {
  if (!s) return "";
  return s.replace(/(\d{4})-(\d{2})-(\d{2})/, "$1년 $2월 $3일");
}

function formatWon(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

/* ─── 한글 도장 (원형 붉은 도장) ─────────────────────────────────── */
function HankoStamp({ name, size = 72 }: { name: string; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r1 = size / 2 - 2;   // outer ring
  const r2 = size / 2 - 7;   // inner ring

  // Split name into at most 2 lines for the stamp
  const chars = [...name];
  let line1 = "";
  let line2 = "";
  if (chars.length <= 2) {
    line1 = name;
  } else if (chars.length === 3) {
    line1 = chars[0];
    line2 = chars[1] + chars[2];
  } else if (chars.length === 4) {
    line1 = chars[0] + chars[1];
    line2 = chars[2] + chars[3];
  } else {
    // 5+: split roughly in half
    const mid = Math.ceil(chars.length / 2);
    line1 = chars.slice(0, mid).join("");
    line2 = chars.slice(mid).join("");
  }

  const fs = line1.length >= 4 ? 9 : line1.length === 3 ? 10 : 13;
  const isSingleLine = !line2;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      style={{ display: "inline-block" }}
      aria-label={`${name} 도장`}
    >
      <circle cx={cx} cy={cy} r={r1} stroke="#c0392b" strokeWidth="2" fill="none" />
      <circle cx={cx} cy={cy} r={r2} stroke="#c0392b" strokeWidth="1" fill="none" />
      {isSingleLine ? (
        <text
          x={cx}
          y={cy + fs * 0.38}
          textAnchor="middle"
          fill="#c0392b"
          fontSize={fs + 2}
          fontWeight="bold"
          fontFamily="'Nanum Myeongjo', 'Batang', serif"
        >
          {line1}
        </text>
      ) : (
        <>
          <text
            x={cx}
            y={cy - fs * 0.3}
            textAnchor="middle"
            fill="#c0392b"
            fontSize={fs}
            fontWeight="bold"
            fontFamily="'Nanum Myeongjo', 'Batang', serif"
          >
            {line1}
          </text>
          <text
            x={cx}
            y={cy + fs * 1.1}
            textAnchor="middle"
            fill="#c0392b"
            fontSize={fs}
            fontWeight="bold"
            fontFamily="'Nanum Myeongjo', 'Batang', serif"
          >
            {line2}
          </text>
        </>
      )}
    </svg>
  );
}

/** 도장 자리 — 미서명 시 빈 점선 박스 */
function StampPlaceholder({ size = 72 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: "1.5px dashed #94a3b8",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#94a3b8",
        fontSize: 10,
      }}
    >
      서명
    </div>
  );
}

/* ─── 공통 서명란 컴포넌트 ────────────────────────────────────────── */
interface SignatureProps {
  date: string;
  employeeName: string;
  birthDate: string;
  signed: boolean;
}

function SignatureSection({ date, employeeName, birthDate, signed }: SignatureProps) {
  const dateStr = formatDateKo(date);
  const birthStr = formatBirthKo(birthDate);
  return (
    <div style={{ marginTop: "28px" }}>
      <p style={{ fontSize: 13, marginBottom: 16, color: "#374151" }}>{dateStr}</p>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 24 }}>
        {/* 갑 — 회사 */}
        <div style={{ flex: 1, borderTop: "1px solid #cbd5e1", paddingTop: 12 }}>
          <table style={{ fontSize: 12, lineHeight: "1.9", width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ color: "#6b7280", width: 80 }}>갑 (회사)</td>
                <td />
              </tr>
              <tr>
                <td style={{ color: "#6b7280" }}>회사명</td>
                <td>주식회사 티앤에스컴퍼니</td>
              </tr>
              <tr>
                <td style={{ color: "#6b7280" }}>대표이사</td>
                <td>김태정</td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 8 }}>
            <HankoStamp name="티앤에스컴퍼니" size={72} />
          </div>
        </div>
        {/* 을 — 직원 */}
        <div style={{ flex: 1, borderTop: "1px solid #cbd5e1", paddingTop: 12 }}>
          <table style={{ fontSize: 12, lineHeight: "1.9", width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ color: "#6b7280", width: 80 }}>을 (직원)</td>
                <td />
              </tr>
              <tr>
                <td style={{ color: "#6b7280" }}>성명</td>
                <td>{employeeName}</td>
              </tr>
              <tr>
                <td style={{ color: "#6b7280" }}>생년월일</td>
                <td>{birthStr}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 8 }}>
            {signed ? <HankoStamp name={employeeName} size={72} /> : <StampPlaceholder size={72} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 서약서(개인정보·경업금지·비밀유지) 공통 서명란 */
function OathSignatureSection({ date, employeeName, birthDate, signed }: SignatureProps) {
  const dateStr = formatDateKo(date);
  const birthStr = formatBirthKo(birthDate);
  return (
    <div style={{ marginTop: 28 }}>
      <p style={{ fontSize: 13, color: "#374151", marginBottom: 12 }}>{dateStr}</p>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <table style={{ fontSize: 12, lineHeight: "2", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ color: "#6b7280", paddingRight: 16 }}>소속</td>
              <td>주식회사 티앤에스컴퍼니</td>
            </tr>
            <tr>
              <td style={{ color: "#6b7280" }}>성명</td>
              <td>{employeeName}</td>
            </tr>
            <tr>
              <td style={{ color: "#6b7280" }}>생년월일</td>
              <td>{birthStr}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginLeft: 8 }}>
          <span style={{ fontSize: 10, color: "#6b7280" }}>(인)</span>
          {signed ? <HankoStamp name={employeeName} size={64} /> : <StampPlaceholder size={64} />}
        </div>
      </div>
    </div>
  );
}

/* ─── 스타일 상수 ─────────────────────────────────────────────────── */
const TH = {
  border: "1px solid #9ca3af",
  padding: "5px 8px",
  backgroundColor: "#f3f4f6",
  fontWeight: 600,
  fontSize: 12,
  textAlign: "center" as const,
};
const TD = {
  border: "1px solid #9ca3af",
  padding: "5px 8px",
  fontSize: 12,
};
const ARTICLE_TITLE = { fontWeight: 700, marginTop: 14, marginBottom: 4, fontSize: 13 } as React.CSSProperties;
const BODY_TEXT = { fontSize: 13, lineHeight: "1.8", color: "#1e293b", margin: "3px 0" } as React.CSSProperties;

/* ─── 연봉계약서 ─────────────────────────────────────────────────── */
export function SalaryContractBody({
  content,
  signed = false,
}: {
  content: SalaryContractContent;
  signed?: boolean;
}) {
  const monthlyMeal = content.monthlyMeal ?? 200_000;
  const monthlyTotal = content.monthlyBase + monthlyMeal;
  return (
    <div style={{ fontFamily: "'Nanum Gothic', 'Apple SD Gothic Neo', sans-serif", color: "#1e293b" }}>
      {/* 제목 */}
      <h2 style={{ textAlign: "center", fontSize: 20, fontWeight: 700, letterSpacing: 4, marginBottom: 6 }}>
        연 봉 계 약 서
      </h2>
      <p style={{ textAlign: "center", fontSize: 12, color: "#6b7280", marginBottom: 20 }}>
        (주)티앤에스컴퍼니 (이하 &quot;갑&quot;)과(와){" "}
        <strong>{content.employeeName}</strong> (이하 &quot;을&quot;)은(는) 다음과 같이
        연봉계약(이하 &quot;본 계약&quot;)을 체결하고, 이를 성실히 준수할 것을 약속합니다.
      </p>

      {/* 제1조 */}
      <p style={ARTICLE_TITLE}>제 1 조 (연봉계약기간)</p>
      <p style={BODY_TEXT}>
        연봉계약기간은 <strong>{formatDateKo(content.startDate)}</strong>부터{" "}
        <strong>{formatDateKo(content.endDate)}</strong>까지로 한다.
      </p>

      {/* 제2조 */}
      <p style={ARTICLE_TITLE}>제 2 조 (연봉의 구성)</p>
      <p style={BODY_TEXT}>
        &quot;을&quot;의 임금은 매월 1일부터 말일까지 산정하여 매월 10일에 &quot;을&quot; 명의의 예금계좌로 지급한다.
      </p>
      <p style={{ ...BODY_TEXT, marginTop: 6 }}>
        &quot;을&quot;의 연봉은 <strong>{formatWon(content.totalAnnual)}</strong>이며, 구성항목은 다음과 같다.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, marginBottom: 10 }}>
        <thead>
          <tr>
            <th style={TH}>구분</th>
            <th style={TH}>항목</th>
            <th style={TH}>월 지급액</th>
            <th style={TH}>연간 합계</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...TD, textAlign: "center" }} rowSpan={2}>월 지급액</td>
            <td style={TD}>기본급 (주휴수당 포함)</td>
            <td style={{ ...TD, textAlign: "right" }}>{formatWon(content.monthlyBase)}</td>
            <td style={{ ...TD, textAlign: "right" }}>{formatWon(content.monthlyBase * 12)}</td>
          </tr>
          <tr>
            <td style={TD}>식대 (비과세)</td>
            <td style={{ ...TD, textAlign: "right" }}>{formatWon(monthlyMeal)}</td>
            <td style={{ ...TD, textAlign: "right" }}>{formatWon(monthlyMeal * 12)}</td>
          </tr>
          <tr>
            <td style={{ ...TD, textAlign: "center", fontWeight: 600 }} colSpan={2}>합계</td>
            <td style={{ ...TD, textAlign: "right", fontWeight: 600 }}>{formatWon(monthlyTotal)}</td>
            <td style={{ ...TD, textAlign: "right", fontWeight: 600 }}>{formatWon(content.totalAnnual)}</td>
          </tr>
        </tbody>
      </table>

      {/* 제3조 */}
      <p style={ARTICLE_TITLE}>제 3 조 (기타)</p>
      <p style={BODY_TEXT}>
        ① 본 계약은 제1조의 계약 기간의 임금에 적용하며, 기타 근로조건 관련 사항은 입사 시 체결한 근로계약서에 의한다.
      </p>
      <p style={BODY_TEXT}>
        ② 연봉에 포함된 식대는 근로소득세법에 따라 월 20만원 한도 내에서 비과세 처리한다.
      </p>
      <p style={BODY_TEXT}>
        ③ 본 계약서에 명시되지 아니한 사항은 근로기준법 및 회사 취업규칙에 따른다.
      </p>

      <SignatureSection
        date={content.startDate}
        employeeName={content.employeeName}
        birthDate={content.birthDate}
        signed={signed}
      />
    </div>
  );
}

/* ─── 근로계약서 ─────────────────────────────────────────────────── */
export function EmploymentContractBody({
  content,
  signed = false,
}: {
  content: EmploymentContractContent;
  signed?: boolean;
}) {
  return (
    <div style={{ fontFamily: "'Nanum Gothic', 'Apple SD Gothic Neo', sans-serif", color: "#1e293b" }}>
      <h2 style={{ textAlign: "center", fontSize: 20, fontWeight: 700, letterSpacing: 4, marginBottom: 6 }}>
        근 로 계 약 서
      </h2>
      <p style={{ textAlign: "center", fontSize: 12, color: "#6b7280", marginBottom: 20 }}>
        (주)티앤에스컴퍼니 (이하 &quot;갑&quot;)과(와){" "}
        <strong>{content.employeeName}</strong> (이하 &quot;을&quot;)은(는) 다음과 같이
        근로계약을 체결하고, 이를 성실히 이행할 것을 약속합니다.
      </p>

      {/* 제1조 */}
      <p style={ARTICLE_TITLE}>제 1 조 (근로계약기간 및 수습)</p>
      <p style={BODY_TEXT}>
        ① 근로계약기간은 <strong>{formatDateKo(content.startDate)}</strong>부터 기간의 정함이 없는 근로계약으로 한다.
      </p>
      <p style={BODY_TEXT}>
        ② 수습기간은 입사일로부터 <strong>{formatDateKo(content.probationEndDate)}</strong>까지로 하며,
        수습기간 중 급여지급률은 100%로 한다. 다만, 수습기간 중 또는 수습기간 만료 시 업무능력·
        적합성 평가에 따라 채용을 취소할 수 있다.
      </p>

      {/* 제2조 */}
      <p style={ARTICLE_TITLE}>제 2 조 (근로장소 및 종사업무)</p>
      <p style={BODY_TEXT}>
        ① &quot;을&quot;의 근로장소는 회사 사업장 및 &quot;갑&quot;이 지정하는 장소로 한다.
      </p>
      <p style={BODY_TEXT}>
        ② &quot;을&quot;의 종사업무(주요 업무)는 <strong>{content.mainWork}</strong>으로 한다.
        &quot;갑&quot;은 업무상 필요한 경우 근로장소 및 담당업무를 변경할 수 있으며, &quot;을&quot;은 정당한 사유 없이 이를 거부할 수 없다.
      </p>

      {/* 제3조 */}
      <p style={ARTICLE_TITLE}>제 3 조 (소정근로시간)</p>
      <p style={BODY_TEXT}>
        ① &quot;을&quot;의 소정근로시간은 1일 8시간, 1주 40시간을 원칙으로 한다.
      </p>
      <p style={BODY_TEXT}>
        ② 시업·종업 시각 및 휴게시간은 회사 취업규칙이 정하는 바에 따른다.
        (기본 09:00 ~ 18:00, 휴게 12:00 ~ 13:00)
      </p>
      <p style={BODY_TEXT}>
        ③ 연장·야간·휴일근로가 필요한 경우 &quot;을&quot;의 동의하에 실시하며,
        근로기준법에 따른 가산임금을 지급하거나 보상휴가로 대체할 수 있다.
      </p>

      {/* 제4조 */}
      <p style={ARTICLE_TITLE}>제 4 조 (휴게시간)</p>
      <p style={BODY_TEXT}>
        근로시간이 4시간인 경우 30분, 8시간인 경우 1시간의 휴게시간을 근로시간 도중에 부여한다.
      </p>

      {/* 제5조 */}
      <p style={ARTICLE_TITLE}>제 5 조 (휴일)</p>
      <p style={BODY_TEXT}>
        ① &quot;을&quot;의 근로일은 월요일~금요일이며, 주휴일은 일요일로 한다.
      </p>
      <p style={BODY_TEXT}>
        ② 관공서의 공휴일 및 대체공휴일은 근로기준법 및 「관공서의 공휴일에 관한 규정」에 따른다.
      </p>
      <p style={BODY_TEXT}>
        ③ 그 외 휴일에 관한 사항은 취업규칙에 따른다.
      </p>

      {/* 제6조 */}
      <p style={ARTICLE_TITLE}>제 6 조 (임금의 구성·지급방법 및 지급시기)</p>
      <p style={BODY_TEXT}>
        ① &quot;을&quot;의 임금은 매월 1일부터 말일까지 산정하여 매월 10일 &quot;을&quot; 명의의 예금계좌로 지급한다.
      </p>
      <p style={BODY_TEXT}>
        ② &quot;을&quot;의 연봉(퇴직금 별도)은 <strong>{formatWon(content.totalAnnual)}</strong>이며,
        월 지급액은 <strong>{formatWon(content.monthlyBase)}</strong>를 기준으로 구성한다.
      </p>
      <p style={BODY_TEXT}>
        ③ 계약 소정근로시간을 초과한 연장·야간·휴일근로에 대해서는 근로기준법에 따른 가산임금을
        지급하거나 보상휴가로 대체한다.
      </p>

      {/* 제7조 */}
      <p style={ARTICLE_TITLE}>제 7 조 (연차유급휴가)</p>
      <p style={BODY_TEXT}>
        ① 연차유급휴가는 근로기준법 제60조에 따른다.
      </p>
      <p style={BODY_TEXT}>
        ② 1년 미만 계속 근로 또는 1년간 80% 미만 출근한 근로자에게는 1개월 개근 시 1일의 유급휴가를 부여한다.
      </p>
      <p style={BODY_TEXT}>
        ③ 1년 이상 계속 근로자에게는 법정 연차유급휴가를 부여하며, 그 외 사항은 취업규칙에 따른다.
      </p>

      {/* 제8조 */}
      <p style={ARTICLE_TITLE}>제 8 조 (기타)</p>
      <p style={BODY_TEXT}>
        ① 이 계약서에 명시되지 아니한 사항은 근로기준법령 및 회사 취업규칙·인사규정에 따른다.
      </p>
      <p style={BODY_TEXT}>
        ② &quot;갑&quot;과 &quot;을&quot;은 본 계약을 성실히 이행하기 위해 상호 협력한다.
      </p>
      <p style={BODY_TEXT}>
        ③ 본 계약은 2부를 작성하여 &quot;갑&quot;과 &quot;을&quot;이 각 1부씩 보관한다.
      </p>

      <SignatureSection
        date={content.startDate}
        employeeName={content.employeeName}
        birthDate={content.birthDate}
        signed={signed}
      />
    </div>
  );
}

/* ─── 개인정보 수집·이용 동의서 ─────────────────────────────────── */
export function PrivacyContractBody({
  content,
  signed = false,
}: {
  content: OathContractContent;
  signed?: boolean;
}) {
  return (
    <div style={{ fontFamily: "'Nanum Gothic', 'Apple SD Gothic Neo', sans-serif", color: "#1e293b" }}>
      <h2 style={{ textAlign: "center", fontSize: 18, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>
        개인정보 수집·이용 동의서
      </h2>
      <p style={{ textAlign: "center", fontSize: 12, color: "#6b7280", marginBottom: 20 }}>
        (주)티앤에스컴퍼니 귀중
      </p>

      <p style={BODY_TEXT}>
        본인 <strong>{content.employeeName}</strong>은(는) 주식회사 티앤에스컴퍼니(이하 &quot;회사&quot;)의
        근로자로서 인사관리상 개인정보의 수집·이용이 필요하다는 것을 이해하고,
        아래와 같은 개인정보·민감정보·고유식별정보를 수집·이용하는 것에 동의합니다.
      </p>

      {/* 개인정보 */}
      <p style={{ ...ARTICLE_TITLE, marginTop: 16 }}>1. 개인정보 수집·이용 동의</p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, marginBottom: 8, fontSize: 12 }}>
        <thead>
          <tr>
            <th style={TH}>수집·이용 목적</th>
            <th style={TH}>수집·이용 항목</th>
            <th style={TH}>보유 및 이용기간</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={TD}>채용, 인사관리, 급여지급, 4대보험 가입·신고</td>
            <td style={TD}>
              성명, 생년월일, 주소, 연락처, 이메일, 사진, 학력, 경력,
              자격증, 은행계좌(급여이체용)
            </td>
            <td style={{ ...TD, textAlign: "center" }}>재직기간 + 퇴직 후 5년</td>
          </tr>
          <tr>
            <td style={TD}>세금신고 (근로소득 원천징수)</td>
            <td style={TD}>성명, 주민등록번호, 주소, 부양가족 현황</td>
            <td style={{ ...TD, textAlign: "center" }}>관계 법령에 따름</td>
          </tr>
        </tbody>
      </table>

      {/* 민감정보 */}
      <p style={ARTICLE_TITLE}>2. 민감정보 수집·이용 동의 (선택)</p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, marginBottom: 8, fontSize: 12 }}>
        <thead>
          <tr>
            <th style={TH}>수집·이용 목적</th>
            <th style={TH}>수집·이용 항목</th>
            <th style={TH}>보유 및 이용기간</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={TD}>건강관리, 장애인 고용지원</td>
            <td style={TD}>건강검진 결과, 장애 여부</td>
            <td style={{ ...TD, textAlign: "center" }}>재직기간 + 퇴직 후 3년</td>
          </tr>
        </tbody>
      </table>

      {/* 고유식별정보 */}
      <p style={ARTICLE_TITLE}>3. 고유식별정보 수집·이용 동의</p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, marginBottom: 8, fontSize: 12 }}>
        <thead>
          <tr>
            <th style={TH}>수집·이용 목적</th>
            <th style={TH}>수집·이용 항목</th>
            <th style={TH}>보유 및 이용기간</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={TD}>4대보험 가입, 세금신고, 법령에 따른 관계기관 신고</td>
            <td style={TD}>주민등록번호, 외국인등록번호</td>
            <td style={{ ...TD, textAlign: "center" }}>관계 법령에 따름</td>
          </tr>
        </tbody>
      </table>

      <p style={{ ...BODY_TEXT, marginTop: 12 }}>
        ※ 위 개인정보 수집·이용에 동의하지 않을 권리가 있으나, 동의 거부 시 입사 및 인사관리에 제한이 있을 수 있습니다.
      </p>
      <p style={BODY_TEXT}>
        ※ 회사가 취득한 개인정보는 재직기간 동안 채용·승진 등 인사관리에 이용하고,
        법령에 따라 관계기관 및 세무·노무 대행업체에 제공할 수 있습니다.
      </p>

      <OathSignatureSection
        date={new Date().toISOString().slice(0, 10)}
        employeeName={content.employeeName}
        birthDate={content.birthDate}
        signed={signed}
      />
    </div>
  );
}

/* ─── 경업금지서약서 ─────────────────────────────────────────────── */
export function NonCompeteContractBody({
  content,
  signed = false,
}: {
  content: OathContractContent;
  signed?: boolean;
}) {
  return (
    <div style={{ fontFamily: "'Nanum Gothic', 'Apple SD Gothic Neo', sans-serif", color: "#1e293b" }}>
      <h2 style={{ textAlign: "center", fontSize: 18, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>
        경업금지서약서
      </h2>
      <p style={{ textAlign: "center", fontSize: 12, color: "#6b7280", marginBottom: 20 }}>
        (주)티앤에스컴퍼니 귀중
      </p>

      <p style={BODY_TEXT}>
        본인 <strong>{content.employeeName}</strong>(이하 &quot;서약인&quot;)은(는) 주식회사 티앤에스컴퍼니
        (이하 &quot;회사&quot;)에 근무함에 있어 다음과 같이 서약합니다.
      </p>

      <p style={ARTICLE_TITLE}>제 1 조 (비밀정보의 보호)</p>
      <p style={BODY_TEXT}>
        서약인은 재직 중 또는 퇴직 후 회사 및 서약인이 보유한 기술상·영업상 비밀,
        고객정보, 거래처 정보, 사업계획 등 일체의 기밀 사항을 제3자에게 이전·양도·공개하거나
        업무 이외의 목적으로 이용하지 아니합니다.
      </p>

      <p style={ARTICLE_TITLE}>제 2 조 (경업금지)</p>
      <p style={BODY_TEXT}>
        서약인은 재직기간 중은 물론, 퇴직일로부터 <strong>1년 이내</strong>에는 회사의 사업과
        동일하거나 경쟁 관계에 있는 사업을 직접 영위(법인 또는 개인사업자 설립·운영 포함)하거나,
        해당 사업체에 임직원·고문·파트너·투자자 등의 자격으로 종사하지 아니합니다.
      </p>

      <p style={ARTICLE_TITLE}>제 3 조 (고객·임직원 유인 금지)</p>
      <p style={BODY_TEXT}>
        서약인은 재직기간 중은 물론, 퇴직일로부터 1년 이내에 회사의 고객 또는 임직원을
        회사로부터 이탈시키거나, 제3자를 위해 영업 목적으로 접촉하는 행위를 하지 아니합니다.
      </p>

      <p style={ARTICLE_TITLE}>제 4 조 (위반 시 조치)</p>
      <p style={BODY_TEXT}>
        서약인이 본 서약서의 내용을 위반할 경우, 회사는 다음 각 호의 조치를 취할 수 있습니다.
      </p>
      <p style={BODY_TEXT}>① 침해 행위의 중지를 구하는 가처분 신청</p>
      <p style={BODY_TEXT}>② 손해배상 청구 (실손해액 및 영업이익 상당액)</p>
      <p style={BODY_TEXT}>③ 부정경쟁방지 및 영업비밀보호에 관한 법률에 따른 형사고발</p>
      <p style={BODY_TEXT}>④ 법원 판결에 따른 경쟁 사업 폐업 또는 업종 변경 요청</p>

      <p style={ARTICLE_TITLE}>제 5 조 (유효기간)</p>
      <p style={BODY_TEXT}>
        본 서약서의 효력은 서약인이 회사에 근무하는 기간 및 퇴직 후 1년까지 유효합니다.
      </p>

      <OathSignatureSection
        date={new Date().toISOString().slice(0, 10)}
        employeeName={content.employeeName}
        birthDate={content.birthDate}
        signed={signed}
      />
    </div>
  );
}

/* ─── 비밀유지서약서 ─────────────────────────────────────────────── */
export function NdaContractBody({
  content,
  signed = false,
}: {
  content: OathContractContent;
  signed?: boolean;
}) {
  return (
    <div style={{ fontFamily: "'Nanum Gothic', 'Apple SD Gothic Neo', sans-serif", color: "#1e293b" }}>
      <h2 style={{ textAlign: "center", fontSize: 18, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>
        비밀유지서약서
      </h2>
      <p style={{ textAlign: "center", fontSize: 12, color: "#6b7280", marginBottom: 20 }}>
        (주)티앤에스컴퍼니 귀중
      </p>

      <p style={BODY_TEXT}>
        본인 <strong>{content.employeeName}</strong>(이하 &quot;서약인&quot;)은(는) 주식회사 티앤에스컴퍼니
        (이하 &quot;회사&quot;)의 임직원으로서 회사의 영업비밀 보호와 관련하여 다음과 같이 서약합니다.
      </p>

      <p style={ARTICLE_TITLE}>제 1 조 (영업비밀의 정의)</p>
      <p style={BODY_TEXT}>
        본 서약서에서 &quot;영업비밀&quot;이란 회사의 업무수행과 관련하여 서약인이 알게 되거나
        제공받는 기술상·경영상의 제반 정보(기술, 경영, 재무, 고객, 거래처, 전략, 계획,
        가격, 계약 조건, 소스코드, 데이터, 아이디어 등)를 포함하며, 이에 한정되지 않습니다.
      </p>

      <p style={ARTICLE_TITLE}>제 2 조 (비밀유지의무)</p>
      <p style={BODY_TEXT}>
        서약인은 재직 중은 물론 퇴직 후에도 다음 각 호의 행위를 하지 아니합니다.
      </p>
      <p style={BODY_TEXT}>① 회사의 사전 서면 승인 없이 영업비밀을 제3자에게 공개·제공·누설하는 행위</p>
      <p style={BODY_TEXT}>② 영업비밀을 업무 이외의 목적으로 복제·사용·저장·반출·전송하는 행위</p>
      <p style={BODY_TEXT}>③ 회사의 이익에 반하는 방법으로 영업비밀을 활용하는 행위</p>

      <p style={ARTICLE_TITLE}>제 3 조 (문서·자료의 반환)</p>
      <p style={BODY_TEXT}>
        서약인은 퇴직 시 또는 회사의 요청이 있을 때 회사에 관한 일체의 문서, 자료, 기록물
        (전자파일 포함)을 즉시 반환하거나 파기하여야 하며, 사본을 보관하지 아니합니다.
      </p>

      <p style={ARTICLE_TITLE}>제 4 조 (유효기간)</p>
      <p style={BODY_TEXT}>
        본 서약서의 효력은 재직기간 중은 물론, 퇴직 후에도 영구적으로 유효합니다.
        단, 제2조의 구체적 의무는 퇴직 후 <strong>3년간</strong> 법적으로 집행 가능하도록 합니다.
      </p>

      <p style={ARTICLE_TITLE}>제 5 조 (손해배상)</p>
      <p style={BODY_TEXT}>
        서약인이 본 서약서를 위반하여 회사에 손해를 입힌 경우, 서약인은 그로 인한 모든 손해를
        배상할 책임이 있으며, 「부정경쟁방지 및 영업비밀보호에 관한 법률」 및 형법상의
        책임을 질 것을 확인합니다.
      </p>

      <OathSignatureSection
        date={new Date().toISOString().slice(0, 10)}
        employeeName={content.employeeName}
        birthDate={content.birthDate}
        signed={signed}
      />
    </div>
  );
}

/* ─── A4 래퍼 ────────────────────────────────────────────────────── */
export function A4Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-slate-200 px-6 py-8 print:bg-white print:p-0">
      <div
        className="mx-auto bg-white shadow-md print:shadow-none"
        style={{
          width: "210mm",
          minHeight: "297mm",
          padding: "20mm 22mm",
          fontSize: "13px",
          lineHeight: "1.7",
          color: "#1e293b",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ─── ContractDocument ───────────────────────────────────────────── */
export function ContractDocument({ contract }: { contract: ContractRow }) {
  const c = contract.content as SalaryContractContent & EmploymentContractContent & OathContractContent;
  const signed = contract.status === "signed";
  switch (contract.contract_type) {
    case "salary":
      return <SalaryContractBody content={c} signed={signed} />;
    case "employment":
      return <EmploymentContractBody content={c} signed={signed} />;
    case "privacy":
      return <PrivacyContractBody content={c} signed={signed} />;
    case "non_compete":
      return <NonCompeteContractBody content={c} signed={signed} />;
    case "nda":
      return <NdaContractBody content={c} signed={signed} />;
    default:
      return <p className="text-slate-500">계약 내용을 표시할 수 없습니다.</p>;
  }
}
