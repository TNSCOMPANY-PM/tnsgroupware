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
  options: { purposeKey: string; maskResidentId: boolean; skipPrintScript?: boolean }
): string {
  const { personal, employment, organization } = profile;
  const purposeLabel =
    PURPOSE_LABELS[options.purposeKey] || options.purposeKey || "기타";
  const issueDate = new Date();
  const dateStr = `${issueDate.getFullYear()}년 ${issueDate.getMonth() + 1}월 ${issueDate.getDate()}일`;

  const printScript = options.skipPrintScript
    ? ""
    : `
  <script>
    window.onload = function() { window.print(); };
  <\/script>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>재직증명서</title>
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
    th { width: 120px; font-weight: 600; color: #475569; background: #f8fafc; font-size: 11px; }
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
  <h1>재직증명서</h1>
  <div class="section-title">기본정보</div>
  <table>
    <tr><th>이름</th><td>${escapeHtml(personal.name)}</td></tr>
    <tr><th>생년월일</th><td>${escapeHtml(personal.birthDate)}</td></tr>
    <tr><th>주소</th><td>${escapeHtml(personal.address)}</td></tr>
  </table>
  <div class="section-title">재직정보</div>
  <table>
    <tr><th>재직기간</th><td>${escapeHtml(employment.joinDate)} - 현재</td></tr>
    <tr><th>조직·직책</th><td>${escapeHtml(organization.department)}</td></tr>
    <tr><th>직무</th><td>${escapeHtml(organization.position)}</td></tr>
  </table>
  <div class="section-title">회사정보</div>
  <table>
    <tr><th>회사명</th><td>${escapeHtml(COMPANY.name)}</td></tr>
    <tr><th>사업자등록번호</th><td>${escapeHtml(COMPANY.bizNo)}</td></tr>
    <tr><th>회사 주소</th><td>${escapeHtml(COMPANY.address)}</td></tr>
    <tr><th>대표 전화번호</th><td>${escapeHtml(COMPANY.repPhone)}</td></tr>
  </table>
  <div class="section-title">발급용도</div>
  <table>
    <tr><th>용도</th><td>${escapeHtml(purposeLabel)}</td></tr>
  </table>
  <div class="foot">
    <p>위와 같이 재직 중임을 증명합니다.</p>
    <p class="date">${dateStr}</p>
    <p>${escapeHtml(COMPANY.nameShort)} 대표이사 ${escapeHtml(COMPANY.repName)} ${SEAL_SVG}</p>
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
  options: { purposeKey: string; maskResidentId: boolean }
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
