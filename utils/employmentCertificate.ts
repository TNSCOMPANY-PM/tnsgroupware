import type { EmployeeDetailProfile } from "@/constants/profile";

/** 사업자등록증 기준 (서울 강서세무소 발급) */
const COMPANY = {
  name: "(주)티앤에스컴퍼니",
  nameShort: "티앤에스컴퍼니",
  nameEn: "TNS Co.",
  bizNo: "455-86-00636",
  address: "서울특별시 강서구 공항대로 247, A동 12층 1209호(마곡동, 퀸즈파크 나인)",
  repPhone: "1833-4150",
  repName: "김태정",
};

const PURPOSE_LABELS: Record<string, string> = {
  financial: "금융기관 제출",
  government: "관공서 제출",
  personal: "개인 소장",
};

/** 대표이사 인장: 빨간 원형, 중앙 "대표이사", 상단 호에 회사명 */
const SEAL_SVG = `<span class="seal-wrap"><svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="46" fill="#b91c1c" stroke="#9f1239" stroke-width="1"/>
  <text x="50" y="52" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="16" font-weight="bold" font-family="Pretendard, Malgun Gothic, sans-serif">대표이사</text>
  <path id="sealArc" d="M 12,28 A 38,38 0 0 1 88,28" fill="none"/>
  <text fill="white" font-size="8" font-weight="600" font-family="Pretendard, Malgun Gothic, sans-serif">
    <textPath href="#sealArc" startOffset="50%" text-anchor="middle">티앤에스컴퍼니 주식회사</textPath>
  </text>
</svg></span>`;

function maskResidentId(id: string): string {
  if (!id || id.length < 8) return id;
  const front = id.slice(0, 6);
  const rest = id.slice(6).replace(/\d/g, "*");
  return `${front}-${rest}`;
}

export function buildCertificateHTML(
  profile: EmployeeDetailProfile,
  options: {
    purposeKey: string;
    maskResidentId: boolean;
    includeJoinDate?: boolean;
    sealType?: "digital" | "physical";
    language?: "ko" | "en";
    memo?: string;
    skipPrintScript?: boolean;
  }
): string {
  const { personal, employment, organization } = profile;
  const lang = options.language ?? "ko";
  const isEn = lang === "en";
  const purposeLabel = PURPOSE_LABELS[options.purposeKey] || options.purposeKey || "기타";
  const issueDate = new Date();
  const dateStr = isEn
    ? `${issueDate.toLocaleString("en-US", { month: "long" })} ${issueDate.getDate()}, ${issueDate.getFullYear()}`
    : `${issueDate.getFullYear()}년 ${issueDate.getMonth() + 1}월 ${issueDate.getDate()}일`;

  const printScript = options.skipPrintScript
    ? ""
    : `
  <script>
    window.onload = function() { window.print(); };
  <\/script>`;

  const sealHtml = options.sealType === "physical"
    ? `<span style="display:inline-block;width:48px;height:48px;border:2px dashed #cbd5e1;border-radius:50%;vertical-align:middle;margin-left:10px;"></span>`
    : SEAL_SVG;

  const memoRow = options.memo
    ? `<tr><th>${isEn ? "Note" : "비고"}</th><td>${escapeHtml(options.memo)}</td></tr>`
    : "";

  const residentRow = options.maskResidentId
    ? ""
    : `<tr><th>${isEn ? "ID Number" : "주민등록번호"}</th><td>${escapeHtml(personal.residentId ? maskResidentId(personal.residentId) : "-")}</td></tr>`;

  const joinDateRow = options.includeJoinDate
    ? `<tr><th>${isEn ? "Group Join Date" : "그룹 입사일"}</th><td>${escapeHtml(employment.joinDate)}</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${isEn ? "Certificate of Employment" : "재직증명서"}</title>
  <style>
    * { box-sizing: border-box; }
    .cert-page {
      font-family: 'Pretendard', 'Malgun Gothic', sans-serif;
      color: #1e293b;
      font-size: 11px;
      line-height: 1.5;
      padding: 20mm 22mm;
      width: 100%;
      min-height: 100%;
      background: #fff;
      margin: 0;
    }
    .doc-id { font-size: 10px; color: #64748b; margin-bottom: 6px; }
    h1 { text-align: center; font-size: 20px; font-weight: 700; margin: 0 0 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 12px; vertical-align: top; }
    th { width: 140px; font-weight: 600; color: #475569; background: #f8fafc; font-size: 11px; }
    td { font-size: 11px; }
    .section-title { font-weight: 700; font-size: 12px; margin: 16px 0 8px; padding-bottom: 2px; }
    .foot { text-align: center; margin-top: 24px; }
    .foot p { margin: 4px 0; font-size: 11px; }
    .foot .date { font-weight: 600; }
    .seal-wrap { display: inline-block; margin-left: 10px; vertical-align: middle; }
    .seal-wrap svg { width: 48px; height: 48px; }
  </style>
</head>
<body style="margin:0;padding:0;background:#fff;">
  <div class="cert-page">
  <div class="doc-id">${issueDate.getFullYear()}-${String(issueDate.getMonth() + 1).padStart(2, "0")}</div>
  <h1>${isEn ? "Certificate of Employment" : "재직증명서"}</h1>
  <div class="section-title">${isEn ? "Personal Information" : "기본정보"}</div>
  <table>
    <tr><th>${isEn ? "Name" : "이름"}</th><td>${escapeHtml(personal.name)}</td></tr>
    <tr><th>${isEn ? "Date of Birth" : "생년월일"}</th><td>${escapeHtml(personal.birthDate)}</td></tr>
    ${residentRow}
    <tr><th>${isEn ? "Address" : "주소"}</th><td>${escapeHtml(personal.address)}</td></tr>
  </table>
  <div class="section-title">${isEn ? "Employment Information" : "재직정보"}</div>
  <table>
    <tr><th>${isEn ? "Employment Period" : "재직기간"}</th><td>${escapeHtml(employment.joinDate)} - ${isEn ? "Present" : "현재"}</td></tr>
    ${joinDateRow}
    <tr><th>${isEn ? "Department" : "조직·직책"}</th><td>${escapeHtml(organization.department)}</td></tr>
    <tr><th>${isEn ? "Position" : "직무"}</th><td>${escapeHtml(organization.position)}</td></tr>
  </table>
  <div class="section-title">${isEn ? "Company Information" : "회사정보"}</div>
  <table>
    <tr><th>${isEn ? "Company" : "회사명"}</th><td>${escapeHtml(isEn ? COMPANY.nameEn : COMPANY.name)}</td></tr>
    <tr><th>${isEn ? "Business Registration No." : "사업자등록번호"}</th><td>${escapeHtml(COMPANY.bizNo)}</td></tr>
    <tr><th>${isEn ? "Address" : "회사 주소"}</th><td>${escapeHtml(COMPANY.address)}</td></tr>
    <tr><th>${isEn ? "Phone" : "대표 전화번호"}</th><td>${escapeHtml(COMPANY.repPhone)}</td></tr>
  </table>
  <div class="section-title">${isEn ? "Purpose of Issue" : "발급용도"}</div>
  <table>
    <tr><th>${isEn ? "Purpose" : "용도"}</th><td>${escapeHtml(purposeLabel)}</td></tr>
    ${memoRow}
  </table>
  <div class="foot">
    <p>${isEn ? "This is to certify that the above-named person is currently employed at our company." : "위와 같이 재직 중임을 증명합니다."}</p>
    <p class="date">${dateStr}</p>
    <p>${escapeHtml(isEn ? COMPANY.nameEn : COMPANY.nameShort)} ${isEn ? "CEO" : "대표이사"} ${escapeHtml(COMPANY.repName)} ${sealHtml}</p>
  </div>
  </div>${printScript}
</body>
</html>`;
}

/**
 * 재직증명서를 PDF 파일로 다운로드합니다.
 * 파일명: 재직증명서_성명_YYYY-MM-DD.pdf
 */
export async function downloadEmploymentCertificateAsPDF(
  profile: EmployeeDetailProfile,
  options: { purposeKey: string; maskResidentId: boolean; includeJoinDate?: boolean; sealType?: "digital" | "physical"; language?: "ko" | "en"; memo?: string }
): Promise<void> {
  const html = buildCertificateHTML(profile, { ...options, skipPrintScript: true });
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "210mm";
  container.style.height = "297mm";
  container.style.background = "#fff";
  container.style.padding = "0";
  container.style.margin = "0";
  container.style.pointerEvents = "none";
  container.style.overflow = "hidden";
  container.setAttribute("data-certificate", "true");
  container.innerHTML = html;
  document.body.appendChild(container);

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(container, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
  });
  document.body.removeChild(container);

  const imgData = canvas.toDataURL("image/png");
  const doc = new jsPDF("p", "mm", "a4");
  const pdfW = doc.internal.pageSize.getWidth();
  const pdfH = doc.internal.pageSize.getHeight();
  doc.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
  const issueDate = new Date();
  const datePart = `${issueDate.getFullYear()}-${String(issueDate.getMonth() + 1).padStart(2, "0")}-${String(issueDate.getDate()).padStart(2, "0")}`;
  const safeName = profile.personal.name.replace(/[/\\?*:"]/g, "_");
  doc.save(`재직증명서_${safeName}_${datePart}.pdf`);
}

/** 재직증명서 PDF 다운로드 (downloadEmploymentCertificateAsPDF 별칭) */
export const downloadEmploymentCertificate = downloadEmploymentCertificateAsPDF;

/** 경력증명서 HTML 생성 */
export function buildCareerCertificateHTML(
  profile: EmployeeDetailProfile,
  options: { purposeKey: string; sealType?: "digital" | "physical"; memo?: string; skipPrintScript?: boolean }
): string {
  const { personal, employment, organization } = profile;
  const purposeLabel = PURPOSE_LABELS[options.purposeKey] || options.purposeKey || "기타";
  const issueDate = new Date();
  const dateStr = `${issueDate.getFullYear()}년 ${issueDate.getMonth() + 1}월 ${issueDate.getDate()}일`;
  const sealHtml = options.sealType === "physical"
    ? `<span style="display:inline-block;width:48px;height:48px;border:2px dashed #cbd5e1;border-radius:50%;vertical-align:middle;margin-left:10px;"></span>`
    : SEAL_SVG;
  const memoRow = options.memo ? `<tr><th>비고</th><td>${escapeHtml(options.memo)}</td></tr>` : "";
  const printScript = options.skipPrintScript ? "" : `<script>window.onload=function(){window.print();}<\/script>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>경력증명서</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #fff; }
    .cert-page {
      font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif;
      color: #1a1a2e;
      font-size: 12px;
      line-height: 1.7;
      padding: 18mm 25mm 20mm;
      width: 210mm;
      min-height: 297mm;
      background: #fff;
    }
    .doc-id {
      font-size: 11px;
      color: #94a3b8;
      margin-bottom: 10mm;
      letter-spacing: 0.03em;
    }
    h1 {
      text-align: center;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: 0.15em;
      margin: 0 0 14mm;
      color: #0f172a;
    }
    .section {
      margin-bottom: 8mm;
    }
    .section-title {
      font-weight: 700;
      font-size: 13px;
      color: #0f172a;
      padding-bottom: 3px;
      border-bottom: 1.5px solid #0f172a;
      margin-bottom: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    tr {
      border-bottom: 1px solid #e2e8f0;
    }
    th {
      width: 130px;
      padding: 7px 14px 7px 16px;
      font-weight: 500;
      color: #475569;
      font-size: 12px;
      text-align: left;
      vertical-align: middle;
    }
    td {
      padding: 7px 14px;
      font-size: 12px;
      color: #1e293b;
      vertical-align: middle;
    }
    .foot {
      text-align: center;
      margin-top: 16mm;
      line-height: 2;
    }
    .foot .statement {
      font-size: 12px;
      color: #334155;
      margin-bottom: 3mm;
    }
    .foot .date {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4mm;
    }
    .foot .signline {
      font-size: 12px;
      color: #1e293b;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
    }
    .seal-wrap { display: inline-block; margin-left: 8px; vertical-align: middle; }
    .seal-wrap svg { width: 52px; height: 52px; }
  </style>
</head>
<body>
  <div class="cert-page">
    <div class="doc-id">${issueDate.getFullYear()}-${String(issueDate.getMonth() + 1).padStart(2, "0")}</div>
    <h1>경 력 증 명 서</h1>

    <div class="section">
      <div class="section-title">인적사항</div>
      <table>
        <tr><th>성명</th><td>${escapeHtml(personal.name)}</td></tr>
        <tr><th>생년월일</th><td>${escapeHtml(personal.birthDate)}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">경력사항</div>
      <table>
        <tr><th>회사명</th><td>${escapeHtml(COMPANY.name)}</td></tr>
        <tr><th>재직기간</th><td>${escapeHtml(employment.joinDate)} ~ 현재</td></tr>
        <tr><th>부서</th><td>${escapeHtml(organization.department)}</td></tr>
        <tr><th>직위/직급</th><td>${escapeHtml(organization.position)}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">발급용도</div>
      <table>
        <tr><th>용도</th><td>${escapeHtml(purposeLabel)}</td></tr>
        ${memoRow}
      </table>
    </div>

    <div class="foot">
      <div class="statement">위와 같이 경력 사항을 증명합니다.</div>
      <div class="date">${dateStr}</div>
      <div class="signline">${escapeHtml(COMPANY.nameShort)} 대표이사 ${escapeHtml(COMPANY.repName)} ${sealHtml}</div>
    </div>
  </div>
  ${printScript}
</body>
</html>`;
}

/** 경력증명서 PDF 다운로드 */
export async function downloadCareerCertificate(
  profile: EmployeeDetailProfile,
  options: { purposeKey: string; sealType?: "digital" | "physical"; memo?: string }
): Promise<void> {
  const html = buildCareerCertificateHTML(profile, { ...options, skipPrintScript: true });
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-9999px;top:0;width:210mm;height:297mm;background:#fff;padding:0;margin:0;pointer-events:none;overflow:hidden;";
  container.setAttribute("data-certificate", "true");
  container.innerHTML = html;
  document.body.appendChild(container);
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const canvas = await html2canvas(container, { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" });
  document.body.removeChild(container);
  const imgData = canvas.toDataURL("image/png");
  const doc = new jsPDF("p", "mm", "a4");
  doc.addImage(imgData, "PNG", 0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight());
  const d = new Date();
  const datePart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const safeName = profile.personal.name.replace(/[/\\?*:"]/g, "_");
  doc.save(`티앤에스컴퍼니_경력증명서_${safeName}_${datePart}.pdf`);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function printEmploymentCertificate(
  profile: EmployeeDetailProfile,
  options: { purposeKey: string; maskResidentId: boolean }
): void {
  const html = buildCertificateHTML(profile, options);
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
