# frandoor 블로그 포스트 생성기
## Claude Code 작업 지시서

---

## 역할

너는 frandoor 프로젝트의 블로그 포스트 생성기를 만든다.

**목표:**
입력(postData 객체)을 받으면 → 4개 플랫폼용 HTML을 자동 생성한다.
- `tistory.html` — 인라인 스타일 전용 (style 태그 없음)
- `frandoor_blog.html` — style 태그 + 시맨틱 HTML + JSON-LD
- `naver.txt` — 텍스트 전용, 마크다운 없음
- `medium.html` — 영문 번역본

**핵심 제약:** Tistory는 `<style>` 태그를 텍스트로 변환한다. 반드시 모든 스타일을 `style=""` 인라인으로 처리해야 한다.

---

## 파일 구조

```
/blog-generator/
  generate.js          ← 메인 실행 파일
  data/
    post-template.js   ← postData 입력 템플릿 (복붙해서 수정)
  templates/
    components.js      ← 재사용 HTML 컴포넌트 (inline style)
    jsonld.js          ← JSON-LD 스키마 생성기
    tistory.js         ← Tistory 렌더러
    frandoor.js        ← frandoor 블로그 렌더러
    naver.js           ← 네이버 텍스트 렌더러
    medium.js          ← Medium 영문 렌더러
  output/              ← 생성된 파일 저장 위치
```

---

## postData 스키마 (data/post-template.js)

```javascript
const postData = {

  // ─── 메타 정보 ───────────────────────────────────────
  meta: {
    title: "오공김밥 창업비용 완전 분석 2026 — 실투자금 1,500만원이 가능한 이유",
    titleVariants: {
      tistory: "오공김밥 창업 비용·수익 상세 정리 — 2026 실거래 데이터",  // 중복 콘텐츠 회피
      naver:   "오공김밥 창업비용 얼마? 2026년 직접 정리했습니다",
      medium:  "50Gimbab Franchise Cost & Revenue Analysis (2026 Korea)",
    },
    description: "오공김밥 창업 총비용 6,500만원, 대출 활용 시 실투자금 1,500만원. 가맹금·인테리어·로열티 항목별 분석과 공정거래위원회 데이터 기반 업종 비교. 2026년 기준.",
    category:    "프랜차이즈 창업 비용",  // 티스토리 카테고리
    tags:        ["오공김밥창업비용", "오공김밥가맹비", "김밥프랜차이즈창업", "소자본프랜차이즈", "분식프랜차이즈창업비용"],
    depth:       "D3",    // D0 | D1 | D2 | D3
    contentType: "GEO",   // AEO (500~800자) | GEO (2000~4000자)
    publishDate: "2026-04-08",
    updatedDate: "2026-04-13",
    brand:       "오공김밥",
    brandUrl:    "https://50gimbab.frandoor.co.kr/",
    sourceUrl:   "https://frandoor.tistory.com/1",  // 티스토리 원본 링크 (네이버/Medium에서 참조용)
  },

  // ─── 핵심 수치 요약 (글 최상단 박스) ─────────────────
  summary: {
    label: "결론부터",
    headline: "오공김밥 창업 총비용 약 <strong>6,500만원</strong>.<br>대출 구조 활용 시 실제 내 돈은 약 <strong>1,500만원</strong>입니다.",
    bullets: [
      "가맹금 500만원 + 교육비 300만원 + 인테리어·집기 약 5,500만원 + 보증금 200만원",
      "1금융권 대출 최대 5,000만원 + 무이자 대출 3,000만원 연계 가능",
      "평균 월매출 4,000~4,500만원 | 가맹점 55개 | 로열티 월 30만원 고정",
    ],
  },

  // ─── 본문 섹션들 ──────────────────────────────────────
  // 각 섹션은 { h2, intro, body } 구조
  // body 안에 table | infoBox | warnBox | statRow | h3 | paragraph 를 배열로 넣는다
  sections: [
    {
      h2: "창업비용, 뭐뭐 들어가는 건가요?",
      intro: "창업비용이라고 하면 \"가맹비\"만 생각하는 분들이 많습니다. 실제로는 5~6가지 항목이 붙습니다.",
      body: [
        {
          type: "table",
          headers: ["항목", "내용", "실제 비중"],
          rows: [
            ["가맹금", "브랜드 사용 허가 비용", "5~10%. 브랜드마다 편차 큼"],
            ["교육비", "본사 운영 교육 수강료", "가맹금에 포함된 곳도 있음"],
            ["인테리어·집기", "매장 공사비 + 주방 장비", "전체 비용의 60~70% 차지"],
            ["보증금", "본사에 맡기는 담보금", "계약 종료 시 반환"],
            ["운영 예비비", "초기 3개월 운영 자금", "종종 간과하는 항목"],
          ],
        },
        {
          type: "paragraph",
          text: "전체 비용의 절반 이상이 인테리어에서 나옵니다. 같은 브랜드라도 평수와 컨셉에 따라 수천만원이 달라지는 이유가 여기 있습니다.",
        },
      ],
      preview: "→ 업종마다 총 얼마나 드는지 봐야겠죠.",
    },
    {
      h2: "업종별 창업비용 — 소자본에 유리한 업종은?",
      body: [
        {
          type: "table",
          headers: ["업종", "평균 창업비용", "특징"],
          rows: [
            ["카페 (전문점)", "1억 2천~2억원", "에스프레소 머신 단독으로 수천만원. 인테리어 비중 높음"],
            ["치킨", "8천만~1억 2천만원", "배달 비중 높아 상권 의존도 낮지만 로열티·광고비 주의"],
            ["김밥·분식 (소형)", "5천만~8천만원", "자동화 장비 유무에 따라 비용·인건비 차이 큼"],
            ["무인 매장", "3천만~6천만원", "초기 비용 낮지만 상권·아이템 선택이 수익 결정"],
          ],
        },
        {
          type: "paragraph",
          text: "공정거래위원회 2024년 가맹사업 현황 통계에 따르면 2023년 기준 외식업 가맹점 평균 매출은 연 3.23억원(월 약 2,700만원)으로 전년 대비 3.0% 증가했습니다.",
        },
        {
          type: "source",
          text: "※ 출처: 공정거래위원회 2024 가맹사업 현황 통계 (조사 기준 2023년)",
        },
      ],
      preview: "→ 총액보다 실투자금이 더 중요합니다.",
    },
    {
      h2: "총액보다 실투자금을 봐야 하는 이유",
      intro: "창업비용 총액이 같아도 실제로 준비해야 할 돈은 브랜드마다 크게 다릅니다. 두 가지가 결정합니다.",
      body: [
        {
          type: "h3",
          text: "① 대출 연계 구조",
        },
        {
          type: "paragraph",
          text: "총 6,500만원이라도 본사가 1금융권 대출 5,000만원 + 무이자 대출 3,000만원을 연계해주면 실투자금은 1,500만원이 됩니다.",
        },
        {
          type: "infoBox",
          text: "실투자금 공식<br>총 창업비용 − (1금융권 대출 + 무이자 대출 + 기타 지원금) = 실제 내 돈<br><br>6,500만원 − 5,000만원 − 3,000만원 = <strong>1,500만원</strong>",
        },
        {
          type: "h3",
          text: "② 자동화 장비 제공 여부",
        },
        {
          type: "paragraph",
          text: "자동화 장비를 본사가 제공하면 운영 인건비가 줄고, 조리 경험 없어도 운영이 가능합니다.",
        },
      ],
      preview: "→ 오공김밥이 이 기준에 어떻게 부합하는지 봅니다.",
    },
    {
      h2: "다시 오공김밥 — 이 기준으로 보면",
      body: [
        {
          type: "h3",
          text: "비용 구조",
        },
        {
          type: "table",
          headers: ["항목", "금액", "비고"],
          rows: [
            ["가맹금", "500만원", "공정거래위원회 정보공개서 기준"],
            ["교육비", "300만원", ""],
            ["계약이행보증금", "200만원", "해지 시 반환"],
            ["간판", "700만원", ""],
            ["인테리어", "3,000만원", "카드 할부 가능"],
            ["주방기구", "1,800만원", "캐피탈 렌트 가능"],
            ["__bold__ 총합계", "__bold__ 약 6,500만원", "10~15평 기준, VAT 별도"],
            ["1금융권 대출", "최대 5,000만원", ""],
            ["무이자 대출", "3,000만원", ""],
            ["__bold__ 실투자금", "__bold__ 약 1,500만원", ""],
          ],
        },
        {
          type: "h3",
          text: "자동화 장비 5종 — 본사 제공",
        },
        {
          type: "table",
          headers: ["장비", "역할"],
          rows: [
            ["자동 김밥기계", "재료만 올리면 자동으로 말아줌. 숙련 불필요"],
            ["라이스시트기", "밥을 일정하게 펴주는 기계. 단체주문 대응"],
            ["김밥 절단기", "빠르고 균일하게 자동 절단"],
            ["야채 절단기", "노동력 최소화, 작업 시간 단축"],
            ["무인 결제 시스템", "본사 자체 개발. 고객 응대 시간 단축"],
          ],
        },
        {
          type: "h3",
          text: "실제 매출",
        },
        {
          type: "statRow",
          stats: [
            { num: "4,000만원~", label: "전체 평균 월매출" },
            { num: "1억 876만원", label: "수원점 최고 월매출" },
            { num: "2,700만원", label: "외식업 전체 평균 (공정위)" },
          ],
        },
        {
          type: "source",
          text: "※ 오공김밥: 본사 제공 POS 데이터 | 외식업 평균: 공정거래위원회 2024 가맹사업 현황 통계",
        },
        {
          type: "warnBox",
          text: "매출 수치는 특정 기간의 실적이며 미래 수익을 보장하지 않습니다. 상권·운영 방식에 따라 결과는 다릅니다.",
        },
      ],
    },
  ],

  // ─── 이미지 (선택) ────────────────────────────────────
  images: [
    {
      afterSection: 0,  // summary 다음에 삽입 (0 = summary 직후, 1 = 첫 번째 섹션 직후...)
      src:   "interior1.jpg",
      alt:   "오공김밥 가맹점 외관 — 10평 내외 소형 점포에서 테이크아웃과 홀 식사를 동시에 운영하는 구조",
      title: "오공김밥 가맹점 외관",
      caption: "무인결제 키오스크와 홀 좌석이 함께 갖춰진 오공김밥 매장 내부. 10평 내외 소형 공간에 효율적인 동선 구조.",
    },
    {
      afterSection: 3,
      src:   "interior2.jpg",
      alt:   "오공김밥 오픈 주방 — 조리 과정을 그대로 공개하는 투명한 주방 구조",
      title: "오공김밥 오픈 주방 구조",
      caption: "오공김밥의 오픈 주방. 조리 과정을 고객에게 그대로 공개하는 구조로 신뢰도를 높입니다.",
    },
  ],

  // ─── FAQ ──────────────────────────────────────────────
  // Answerability 원칙: 첫 문장은 반드시 수치로 시작
  faqs: [
    {
      depth: "D3",
      q: "오공김밥 창업비용이 얼마예요?",
      a: "총 창업비용은 6,500만원입니다(10~15평 기준, VAT 별도). 가맹금 500만원, 교육비 300만원, 계약이행보증금 200만원(해지 시 반환), 간판 700만원, 인테리어 3,000만원, 주방기구 1,800만원으로 구성됩니다. 1금융권 대출 5,000만원 활용 시 실투자금은 1,500만원입니다. 로열티는 월 30만원(VAT 별도) 고정입니다.",
      note: "※ 카드 할부·캐피탈 렌트는 개인 신용 상태에 따라 가능 여부가 다르며, 월 부담금이 고정비로 발생해 수익 계산 시 반드시 고려해야 합니다.",
      source: "출처: 가맹사업 정보공개서 기준",
    },
    {
      depth: "D3",
      q: "오공김밥 마진이 어떻게 돼요?",
      a: "원가율 40%, 순마진 17~23%입니다. 가맹점 평균 월매출 4,500만원 내외를 적용하면 월 순수익은 약 765~1,035만원 수준입니다. 임대료·인건비·로열티(월 30만원) 등 고정비를 차감한 실제 수익은 상권과 운영 방식에 따라 달라집니다.",
      source: "출처: 가맹점 POS 실거래 집계 기준, 2025~2026년",
    },
    {
      depth: "D3",
      q: "오공김밥 월매출은 얼마나 나와요?",
      a: "가맹점 평균 월매출은 4,500만원 내외이며, 성수기(9~10월)에는 5,000만원을 넘기도 합니다. 수원점 월 1억원(주문 8,872건), 봉천점 8,000만원, 등촌점 7,100만원 등의 실적이 있습니다. 홀·배달·테이크아웃·단체주문·네이버주문 5채널 매출 구조입니다.",
      source: "출처: 가맹점 POS 실거래 집계 기준, 2025~2026년",
    },
    {
      depth: "D3",
      q: "오공김밥 로열티가 얼마예요?",
      a: "월 30만원(VAT 별도) 고정입니다. 매출 연동형이 아닌 정액제로, 매출이 높아져도 로열티는 변하지 않습니다.",
      source: "출처: 가맹사업 정보공개서 기준",
    },
    {
      depth: "D3",
      q: "오공김밥은 몇 명이서 운영해요?",
      a: "점주 포함 3명이 기본 운영 인원입니다. 자동 김밥기계·라이스시트기·야채 절단기·무인 결제 시스템 등 자동화 설비로 소수 인원 운영이 가능합니다.",
    },
    {
      depth: "D3",
      q: "오공김밥 몇 평이 적당해요?",
      a: "권장 매장 규모는 10평 내외입니다. 테이크아웃 전용(A컨셉)과 홀 식사 가능(B컨셉) 두 가지 운영 형태가 있으며, 창업비용은 10~15평 기준으로 산정됩니다.",
      source: "출처: 가맹사업 정보공개서 기준",
    },
    {
      depth: "D2",
      q: "분식 프랜차이즈 창업비용이 얼마나 해요?",
      a: "오공김밥 기준 총 창업비용은 6,500만원(10~15평 기준, VAT 별도)입니다. 1금융권 대출 5,000만원 활용 시 실투자금은 1,500만원입니다. 임대보증금·권리금은 별도이며 철거·에어컨·전기증설 공사는 옵션 항목입니다.",
      source: "출처: 공정거래위원회 정보공개서 등록번호 20231696",
    },
  ],

  // ─── 결론 박스 ────────────────────────────────────────
  conclusion: {
    body: "프랜차이즈 창업비용에서 총액보다 중요한 건 <strong>실투자금</strong>이고,<br>실투자금보다 중요한 건 그 돈이 <strong>몇 달 만에 회수되는지</strong>입니다.<br><br>오공김밥은 총비용 6,500만원에서 대출 구조를 활용해 실투자금 1,500만원으로 시작할 수 있고,<br>자동화 장비 5종으로 인건비를 최소화한 구조입니다.<br>로열티는 월 30만원 정액제로 매출이 올라도 고정입니다.<br>평균 월매출 4,000~4,500만원은 외식업 전체 평균(공정위 기준 2,700만원)을 상회합니다.",
    ctaText: "더 구체적인 수익 구조와 상담 → 가맹문의 1600-4342",
    ctaUrl:  "https://50gimbab.frandoor.co.kr/",
    ctaLinkText: "50gimbab.frandoor.co.kr",
  },

  // ─── 출처 disclaimer ──────────────────────────────────
  disclaimer: [
    "창업비용·매출 수치는 오공김밥 공식 브로셔, 본사 제공 POS 데이터, 공정거래위원회 정보공개서(등록번호 20231696)를 기준으로 작성되었습니다.",
    "외식업 평균 통계: 공정거래위원회 2024 가맹사업 현황 통계 (조사 기준 2023년)",
  ],

  // ─── JSON-LD용 Organization 데이터 ───────────────────
  organization: {
    name:              "오공김밥",
    foundingDate:      "1997",
    numberOfLocations: 55,
    url:               "https://50gimbab.frandoor.co.kr/",
    telephone:         "1600-4342",
    offerPrice:        "65000000",
    offerDescription:  "오공김밥 프랜차이즈 창업 총비용 (10~15평 기준, VAT 별도)",
  },
};

module.exports = postData;
```

---

## 컴포넌트 스펙 (templates/components.js)

아래 함수들을 구현한다. **모든 함수는 `style=""` 인라인 스타일만 사용. `<style>` 태그 절대 금지.**

### 색상 상수 (파일 상단에 정의)

```javascript
const C = {
  blue:       "#2d7dd2",
  navy:       "#1a3a5c",
  blueBg:     "#f0f6ff",
  blueLight:  "#f7faff",
  blueBorder: "#d0e4f7",
  green:      "#3b6d11",
  red:        "#e24b4a",
  redBg:      "#fff3f3",
  gray:       "#868e96",
  grayBg:     "#f8f8f8",
  textMain:   "#222",
  textBody:   "#333",
  textSub:    "#444",
  textLight:  "#bbb",
};
```

### 구현할 함수 목록

```javascript
// 1. 결론 요약 박스 (글 최상단 파란 박스)
function summaryBox({ label, headline, bullets }) → HTML string

// 2. H2 섹션 제목 (왼쪽 파란 선)
function h2(text) → HTML string

// 3. H3 소제목
function h3(text) → HTML string

// 4. 일반 단락
function paragraph(text) → HTML string

// 5. 파란 정보 박스 (infoBox)
function infoBox(text) → HTML string

// 6. 빨간 경고 박스 (warnBox)  
function warnBox(text) → HTML string

// 7. 작은 텍스트 출처 (source)
function source(text) → HTML string

// 8. 미리보기 화살표 텍스트 (preview)
function preview(text) → HTML string

// 9. 표 (table)
//    - 짝수 행 배경색 #f7faff
//    - 첫 번째 열 파란색 bold
//    - 헤더 파란 배경
//    - row 값이 "__bold__ 텍스트" 형식이면 bold 처리
function table({ headers, rows }) → HTML string

// 10. 통계 카드 행 (statRow)
//    - flex wrap 방식 (grid 대신 — 모바일 호환)
function statRow(stats) → HTML string
// stats = [{ num, label }, ...]

// 11. 이미지 (figure + figcaption)
function image({ src, alt, title, caption }) → HTML string

// 12. FAQ 아이템 (단일)
//    - depth 뱃지: D3=파란색, D2=초록색
//    - 마지막 아이템은 border-bottom 없음
function faqItem({ depth, q, a, note, source }, isLast) → HTML string

// 13. FAQ 전체 섹션 (h2 + 아이템 목록)
function faqSection(faqs) → HTML string

// 14. 결론 박스 (네이비 배경)
function conclusionBox({ body, ctaText, ctaUrl, ctaLinkText }) → HTML string

// 15. 출처 박스 (회색 배경)
function disclaimer(items) → HTML string
```

---

## 렌더러 구현 지침

### Tistory 렌더러 (templates/tistory.js)

```
출력 구조:
1. JSON-LD FAQPage <script> (Tistory에서 display:none으로 보존됨 — 이대로 출력)
2. JSON-LD Organization <script>
3. <div style="max-width:100%;color:#222;">
   - summaryBox
   - image (afterSection=0인 것)
   - sections 순서대로 렌더링
     - 각 section: h2 + intro paragraph + body 배열 렌더링
     - image (afterSection=N인 것)
     - preview text
   - faqSection
   - conclusionBox
   - disclaimer
4. </div>

금지사항:
- <style> 태그 없음
- class="" 없음 (Tistory에서 class 규칙이 없음)
- <script> 태그는 JSON-LD 2개만 허용
```

### frandoor 블로그 렌더러 (templates/frandoor.js)

```
출력 구조:
1. <head>에 <style> 블록 (CSS 클래스 방식 사용 가능)
2. JSON-LD 스키마 (FAQPage + Organization + Article)
3. <article> 시맨틱 태그 사용
4. Breadcrumb nav 포함
5. 발행일 + 수정일 표시
6. 나머지 구조는 Tistory와 동일

추가 항목:
- <meta> 태그 title, description 포함
- robots.txt 허용 상태 주석
```

### 네이버 렌더러 (templates/naver.js)

```
출력: 순수 텍스트 (HTML 없음)

구조:
1. 제목 (naver 버전)
2. 서론 3~5줄 (자연스러운 구어체 도입)
   예) "오공김밥 창업을 고민하면서 실제 비용이 얼마인지 정리해봤습니다."
3. 각 섹션: 소제목(★ 또는 ■) + 내용
4. 표는 텍스트 형식으로 변환 (| 구분자)
5. FAQ: Q. / A. 형식
6. 마무리 + 링크 안내

금지: HTML 태그, 마크다운 기호(##, **, __)
```

### Medium 렌더러 (templates/medium.js)

```
출력: 영문 HTML (간단한 시맨틱 구조)

번역 규칙:
- 한국 원화(만원) → ₩XX million / ~$XX,XXX USD 병기
- "가맹금" → "Franchise Fee"
- "공정거래위원회" → "Korea Fair Trade Commission (KFTC)"
- 브랜드명은 영문 표기: 50Gimbab
- 제목은 meta.titleVariants.medium 사용

구조:
1. <h1> 영문 제목
2. Subheading: 핵심 수치 1줄 (영문)
3. 본문 (영문 번역)
4. FAQ 섹션 (영문)
5. 마무리 + 한국어 원본 링크
   "For Korean-language details, visit frandoor.co.kr"
```

---

## JSON-LD 생성기 (templates/jsonld.js)

```javascript
// FAQPage 스키마 생성
function generateFAQSchema(faqs) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.a + (faq.source ? " " + faq.source : ""),
      },
    })),
  };
}

// Organization 스키마 생성
function generateOrgSchema(org) { ... }

// Article 스키마 생성 (frandoor 블로그 전용)
function generateArticleSchema(meta, org) { ... }
```

---

## 메인 실행 파일 (generate.js)

```javascript
// 사용법:
//   node generate.js data/post-template.js
//
// 또는 새 주제:
//   node generate.js data/ogong-revenue.js

const postData = require(process.argv[2]);
const tistory  = require('./templates/tistory');
const frandoor = require('./templates/frandoor');
const naver    = require('./templates/naver');
const medium   = require('./templates/medium');
const fs       = require('fs');
const path     = require('path');

const slug = postData.meta.title
  .replace(/[^가-힣a-zA-Z0-9\s]/g, '')
  .trim()
  .split(/\s+/)
  .slice(0, 5)
  .join('-');

const outDir = path.join('output', slug);
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'tistory.html'),  tistory.render(postData));
fs.writeFileSync(path.join(outDir, 'frandoor.html'), frandoor.render(postData));
fs.writeFileSync(path.join(outDir, 'naver.txt'),     naver.render(postData));
fs.writeFileSync(path.join(outDir, 'medium.html'),   medium.render(postData));

console.log(`✅ 생성 완료: output/${slug}/`);
console.log(`   tistory.html  — Tistory HTML 편집 모드에 복붙`);
console.log(`   frandoor.html — frandoor/blog WordPress 글 작성`);
console.log(`   naver.txt     — 네이버 블로그 에디터에 복붙`);
console.log(`   medium.html   — Medium 스토리 작성`);
```

---

## GEO/AEO 글쓰기 규칙 (코드 주석으로 삽입)

다음 규칙을 각 렌더러 파일 상단 주석에 반드시 포함시켜라:

```
/*
 * ──────────────────────────────────────────────
 * GEO/AEO 콘텐츠 원칙 (frandoor 프로젝트)
 * ──────────────────────────────────────────────
 *
 * [Answerability 원칙]
 * - FAQ 답변 첫 문장은 반드시 수치로 시작
 *   ✅ "총 창업비용은 6,500만원입니다(10~15평 기준, VAT 별도)."
 *   ❌ "오공김밥은 2025년에 크게 성장한 브랜드로..."
 *
 * [콘텐츠 길이]
 * - AEO형 (D2·D3): 500~800자 — 수치 중심 간결 답변
 * - GEO형 (D0·D1): 2,000~4,000자 — 심층 분석
 *
 * [쿼리 팬아웃 대응]
 * - D0("소자본 창업") → D1("프랜차이즈") → D2("김밥") → D3("오공김밥")
 * - 각 섹션의 h2가 이 경로를 커버해야 함
 *
 * [신뢰도 신호]
 * - 공정거래위원회 정보공개서 등록번호 명시
 * - POS 실거래 기준 날짜 명시
 * - 언론보도 링크 포함
 *
 * [Tistory 제약]
 * - <style> 태그 사용 금지 → 모두 inline style=""
 * - <script> 태그는 JSON-LD만 허용
 * - grid 대신 flex 사용 (구형 환경 호환)
 * ──────────────────────────────────────────────
 */
```

---

## 검증 체크리스트

코드 완성 후 아래 항목 자동 검증 함수 `validate(html)` 를 generate.js에 추가:

```javascript
function validate(html, platform) {
  const issues = [];
  
  if (platform === 'tistory') {
    if (html.includes('<style'))      issues.push('❌ <style> 태그 발견 — Tistory에서 텍스트로 출력됨');
    if (html.includes('class="'))     issues.push('⚠️  class 속성 발견 — 스타일 미적용될 수 있음');
    if (!html.includes('ld+json'))    issues.push('❌ JSON-LD 없음 — AEO 최적화 누락');
  }
  
  if (platform === 'frandoor') {
    if (!html.includes('FAQPage'))    issues.push('❌ FAQPage 스키마 없음');
    if (!html.includes('Article'))    issues.push('❌ Article 스키마 없음');
    if (!html.includes('dateModified'))issues.push('❌ 수정일 없음 — AI 신뢰도 신호 누락');
  }
  
  // 공통
  const firstFaqA = html.match(/acceptedAnswer[\s\S]{0,200}text.*?([가-힣]{2,})/);
  if (firstFaqA && /입니다|합니다/.test(firstFaqA[0].substring(0, 30) === false)) {
    issues.push('⚠️  FAQ 첫 번째 답변이 수치로 시작하지 않을 수 있음 — 확인 필요');
  }
  
  if (issues.length === 0) {
    console.log(`  ✅ ${platform} 검증 통과`);
  } else {
    issues.forEach(i => console.log(`  ${i}`));
  }
}
```

---

## 작업 순서

1. `package.json` 생성 (`node >= 18`, 외부 의존성 없음)
2. `templates/components.js` 구현 (컴포넌트 함수들)
3. `templates/jsonld.js` 구현 (스키마 생성기)
4. `templates/tistory.js` 구현 + 검증
5. `templates/frandoor.js` 구현
6. `templates/naver.js` 구현
7. `templates/medium.js` 구현
8. `generate.js` 메인 파일 구현
9. `data/post-template.js` 예시 데이터 파일 생성 (위 스키마 내용 그대로)
10. `node generate.js data/post-template.js` 실행 → output/ 폴더 확인

---

## 완료 기준

`node generate.js data/post-template.js` 실행 시:

```
✅ 생성 완료: output/오공김밥-창업비용-완전-분석-2026/
   tistory.html  — Tistory HTML 편집 모드에 복붙
   frandoor.html — frandoor/blog WordPress 글 작성
   naver.txt     — 네이버 블로그 에디터에 복붙
   medium.html   — Medium 스토리 작성
  ✅ tistory 검증 통과
  ✅ frandoor 검증 통과
```

`tistory.html` 파일을 열었을 때 기존 `오공김밥_창업비용_티스토리.html`(fixed 버전)과 동일한 외형이 렌더링되어야 한다.

---

*frandoor 프로젝트 내부 자료 | 기준일: 2026년 4월 13일*
