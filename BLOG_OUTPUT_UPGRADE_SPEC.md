# 블로그 생성 결과물 업그레이드 — Claude Code 구현 SPEC

> 현재 blog-generate가 마크다운 텍스트를 뱉고 있음.
> frandoor.tistory.com/1 수준의 완성된 HTML을 바로 뱉도록 프롬프트 + 출력 포맷을 개선한다.
> **promptBuilder.ts만 수정. route.ts는 건드리지 않는다.**

---

## 0. 문제 정의

### 현재 (AS-IS)
```
blog-generate → 마크다운 텍스트 (## 제목, 텍스트만)
→ 사람이 수동으로 HTML 변환 + CSS 입히기 + JSON-LD 작성 + FAQ 구조화
→ 티스토리에 수동 업로드
```

### 목표 (TO-BE)
```
blog-generate → 완성된 HTML (og-wrap CSS + 구조화된 섹션 + JSON-LD + FAQ)
→ 그대로 티스토리/frandoor에 붙여넣기 가능
→ 변환 API(BLOG_CONVERT_SPEC)로 네이버/Medium 버전 자동 생성
```

---

## 1. 참조 — frandoor.tistory.com/1의 HTML 구조

이 글이 "정답"이다. 모든 생성 결과물은 이 구조를 따라야 한다.

### 1-1. 글 전체 구조 (순서 중요)

```
1. [결론부터] answer-box         ← 핵심 수치 3줄 요약. 글 최상단
2. [대표 이미지]                 ← 브랜드 매장 이미지
3. [여기서 끝내도 됩니다]        ← 이미 답을 얻은 사람은 여기서 이탈 OK
4. [본론 시작] H2 섹션들         ← 질문형 소제목, 표+해석, info-box
5. [다시 브랜드로] H2            ← 비용표 + 자동화 장비표 + stat-box
6. [FAQ 섹션]                    ← Q 배지 + 답변 + 출처
7. [결론 박스] conclusion-box    ← 네이비 배경, 핵심 요약, CTA
8. [면책 문구] disclaimer        ← 출처 명시
```

### 1-2. HTML 컴포넌트 목록

| 컴포넌트 | CSS 클래스 | 용도 |
|---------|-----------|------|
| 결론부터 박스 | `.answer-box` | 글 최상단. 파란 배경, 핵심 수치 강조 |
| 섹션 제목 | `h2` | 왼쪽 파란 보더 4px. 질문형 |
| 비교 테이블 | `table` | 파란 헤더, 줄무늬, 첫 열 파란 볼드 |
| 정보 박스 | `.info-box` | 파란 왼쪽 보더. 공식/수식 설명 |
| 경고 박스 | `.warn` | 빨간 왼쪽 보더. 주의사항 |
| 통계 그리드 | `.stat-row > .stat-box` | 3열 그리드. 숫자 + 라벨 |
| 미리보기 링크 | `.preview` | 회색 이탤릭. "→ ~봐야겠죠" |
| FAQ 아이템 | `.faq-item` | Q배지(파란/초록) + 질문 + 답변 + 출처 |
| 결론 박스 | `.conclusion-box` | 네이비 배경, 흰 텍스트, CTA 링크 |
| 면책 문구 | `.disclaimer` | 회색 배경, 작은 글씨, 출처 나열 |
| 출처 표시 | `.source` | 회색 작은 글씨. 표 아래에 |

### 1-3. CSS 템플릿 (og-wrap)

아래 CSS는 **프롬프트에 포함하지 않는다.** 프론트엔드에서 고정 CSS로 관리하고, AI는 HTML 구조만 생성한다.

```
파일: constants/blogCssTemplate.ts
export const OG_WRAP_CSS = `<style>...</style>`; // frandoor.tistory.com/1의 CSS 그대로
```

→ 프론트에서 `blogResult.content`를 렌더링할 때 `OG_WRAP_CSS + content`로 합침.
→ AI가 매번 CSS를 생성하면 토큰 낭비 + 일관성 깨짐.

---

## 2. 수정 파일 — `utils/promptBuilder.ts`

### 2-1. CHANNEL.frandoor 프롬프트 교체

기존 프롬프트를 아래로 **전체 교체**한다.

```ts
frandoor: (data) => `
[SYSTEM]
당신은 프랜차이즈 창업 정보를 다루는 전문 에디터입니다.
결과물은 HTML로 출력합니다. .og-wrap 안에 들어갈 HTML을 생성합니다.
CSS는 외부에서 주입하므로 <style> 태그를 생성하지 마세요.

[STRUCTURE — 이 순서를 반드시 지킬 것]

① answer-box (결론부터)
<div class="answer-box">
  <div class="q">결론부터</div>
  <div class="a">[브랜드명] [핵심 결론 1줄]. <span>[강조 수치]</span>.</div>
  <div class="detail">[비용 구성 요약 1줄]<br>[대출/지원 구조 1줄]<br>[매출·가맹점·로열티 등 부가 정보 1줄]</div>
</div>

② 대표 이미지 위치
<p>[이미지: 브랜드 매장 외관/내부 설명]</p>

③ 이탈 유도 문장
<p>여기서 끝내도 됩니다. 숫자가 필요했던 분이라면 이미 답을 얻으셨으니까요.</p>
<p>이 숫자가 어떻게 나왔는지 궁금하신 분은 계속 읽으시면 됩니다.</p>
<p class="preview">→ [다음 섹션 예고]</p>

④ H2 본론 섹션 3~5개 — 질문형 소제목
<h2>[질문형 소제목]</h2>
각 섹션에는 아래 컴포넌트를 적절히 배치:
- <table> (비교 데이터. 반드시 .table-wrap으로 감쌈)
  <div class="table-wrap"><table>...</table></div>
- <div class="info-box">...</div> (공식, 계산식, 핵심 설명)
- <div class="warn">...</div> (주의사항, 리스크)
- <div class="stat-row"><div class="stat-box"><div class="num">수치</div><div class="lbl">라벨</div></div>...</div> (3열 통계 그리드)
- <p class="source">※ 출처: ...</p> (표 또는 수치 바로 아래)
- <p class="preview">→ 다음 섹션 예고</p> (섹션 끝)

⑤ FAQ 섹션
<h2>자주 묻는 질문</h2>
<div class="faq-item">
  <div class="faq-q"><span class="tag">Q</span>[질문]</div>
  <div class="faq-a">[답변]<div class="faq-source">출처: [출처명]</div></div>
</div>
(5~7개. 창업비용/마진/매출/로열티/인원/평수/업종비교 순서)

⑥ 결론 박스
<div class="conclusion-box">
  <div class="title">결론</div>
  <div class="body">[3~5줄 핵심 요약. <strong>강조 수치</strong> 사용 가능]</div>
  <div class="cta">더 구체적인 수익 구조와 상담 → <a href="[랜딩URL]">가맹문의 [전화번호] | [URL]</a></div>
</div>

⑦ 면책
<div class="disclaimer">[출처 나열. 3줄 이상]</div>

[WRITING RULES]
- 첫 줄(answer-box)에서 핵심 답을 끝낸다. AI가 이 박스만 읽어도 답이 되게.
- "결론부터" → "본론" → "결론" 3단 구조. 결론이 처음과 끝에 두 번.
- 표에는 반드시 해석 문장을 앞뒤에 붙인다. 표만 덩그러니 두지 말 것.
- 각 H2 섹션 끝에 → 다음 섹션 연결 문장 (preview 클래스).
- 수치 70% 이상은 공정위·통계청 공식 자료. 출처 필수.
- AI가 쓴 티 나는 표현 금지: "함께 알아보겠습니다", "~해드리겠습니다", "상세히", "~라는 뜻이죠", "감이 옵니다", "~고민하신다면"
- 마크다운 **볼드** 금지. HTML <strong>만 conclusion-box 안에서 허용.
- 이모지 금지.

[GEO 최적화 — AI 검색엔진이 인용하게 만드는 구조]
- answer-box: AI가 "결론부터" 블록을 발견하면 바로 인용 가능
- FAQ: question-answer 쌍이 명확하면 AI가 FAQ 그대로 가져감
- stat-row: 정량 데이터가 구조화되어 있으면 AI가 수치를 정확히 추출
- source 태그: 출처가 명시되면 AI가 신뢰도 높은 콘텐츠로 판단
- 이 모든 구조가 JSON-LD FAQPage 스키마와 1:1 매칭되어야 함

${buildDataBlock(data)}

[OUTPUT] HTML만 출력. <div class="og-wrap">으로 감싸지 말 것 (프론트에서 감쌈). <style> 태그 금지. 분량 3,000~5,000자.
`,
```

### 2-2. CHANNEL.tistory 프롬프트 교체

티스토리도 동일한 HTML 구조를 사용하되, `<style>` 태그를 포함한다.
(티스토리는 HTML 직접 편집이므로 CSS가 내장되어야 함)

```ts
tistory: (data) => `
[SYSTEM]
frandoor 채널과 동일한 구조로 HTML을 생성합니다.
단, 티스토리에 직접 붙여넣기할 것이므로 아래 차이만 적용:
1. <style> 태그를 맨 위에 포함 (og-wrap CSS 전체)
2. <div class="og-wrap">으로 전체를 감쌈
3. JSON-LD <script type="application/ld+json"> 2개를 맨 위에 포함
   - FAQPage 스키마 (FAQ 섹션과 1:1 매칭)
   - Organization 스키마 (브랜드 정보)
4. 이미지 위치에 [이미지: 설명] 대신 실제 <img> 태그 (src는 비워두기: src="")

나머지 HTML 구조, 작성 규칙, GEO 최적화 규칙은 frandoor 채널과 완전히 동일하게.

${buildDataBlock(data)}

[OUTPUT] 완성된 HTML. <style> + JSON-LD + <div class="og-wrap">...</div> 전부 포함. 분량 3,000~5,000자.
`,
```

### 2-3. JSON_OUTPUT 변수 수정

frandoor/tistory 채널일 때 content 필드에 HTML이 들어가므로, 출력 포맷 설명을 업데이트한다.

```ts
const JSON_OUTPUT = `
[OUTPUT FORMAT — JSON으로만 응답. 다른 텍스트 없이 JSON만 출력]
\`\`\`json
{
  "title": "글 제목 (연도 포함)",
  "meta_description": "155자 이내 메타 디스크립션. AI가 이것만 읽어도 글의 핵심을 알 수 있게",
  "keywords": ["키워드1", "키워드2", ...최소 5개],
  "content": "본문 전체 HTML (frandoor/tistory) 또는 마크다운 (naver/medium)",
  "faq": [{"q": "질문", "a": "답변 (출처 포함)"}],
  "schema_markup": "JSON-LD 스크립트 (FAQPage + Organization). faq 배열과 반드시 1:1 매칭",
  "seo_score_tips": ["개선 제안1", "개선 제안2"],
  "sources_cited": ["공정거래위원회 정보공개서", "통계청 2025", ...실제 인용한 출처만],
  "character_count": 3500
}
\`\`\`
`;
```

---

## 3. 신규 파일 — `constants/blogCssTemplate.ts`

frandoor.tistory.com/1에서 사용한 CSS를 상수로 관리한다.

```ts
// 이 CSS는 AI가 생성하지 않음. 프론트에서 content와 합쳐서 렌더링.
// 티스토리 채널은 AI가 이 CSS를 content에 포함해서 생성함.

export const OG_WRAP_CSS = `
.og-wrap { max-width: 100%; color: #222; }
.og-wrap .answer-box { background: #f0f6ff; border-radius: 10px; padding: 22px 26px; margin-bottom: 20px; }
.og-wrap .answer-box .q { font-size: 0.83rem; color: #888; margin-bottom: 8px; font-weight: 600; }
.og-wrap .answer-box .a { font-size: 1.05rem; font-weight: 700; color: #1a3a5c; line-height: 1.8; }
.og-wrap .answer-box .a span { color: #2d7dd2; }
.og-wrap .answer-box .detail { font-size: 0.87rem; color: #557; margin-top: 10px; line-height: 1.75; border-top: 1px solid #d0e4f7; padding-top: 10px; }
.og-wrap h2 { font-size: 1.18rem; font-weight: 700; margin: 44px 0 14px; color: #111; padding-left: 12px; border-left: 4px solid #2d7dd2; }
.og-wrap h3 { font-size: 1rem; font-weight: 700; margin: 26px 0 10px; color: #333; }
.og-wrap p { font-size: 0.96rem; line-height: 1.95; margin-bottom: 14px; color: #333; }
.og-wrap table { width: 100%; border-collapse: collapse; margin: 16px 0 24px; font-size: 0.9rem; }
.og-wrap th { background: #2d7dd2; color: #fff; padding: 10px 14px; text-align: left; font-weight: 600; }
.og-wrap td { padding: 9px 14px; border-bottom: 1px solid #eee; vertical-align: top; }
.og-wrap tr:nth-child(even) td { background: #f7faff; }
.og-wrap td:first-child { font-weight: 600; color: #2d7dd2; width: 28%; }
.og-wrap .info-box { background: #f0f6ff; border-left: 4px solid #2d7dd2; padding: 14px 20px; margin: 20px 0; border-radius: 0 6px 6px 0; font-size: 0.93rem; line-height: 1.85; color: #1a3a5c; }
.og-wrap .preview { font-size: 0.87rem; color: #bbb; text-align: right; margin-top: 4px; font-style: italic; }
.og-wrap .source { font-size: 0.77rem; color: #bbb; margin: -10px 0 20px; }
.og-wrap .stat-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 16px 0 8px; }
.og-wrap .stat-box { background: #f7faff; border-radius: 8px; padding: 14px; text-align: center; }
.og-wrap .stat-box .num { font-size: 1.2rem; font-weight: 700; color: #2d7dd2; }
.og-wrap .stat-box .lbl { font-size: 0.77rem; color: #888; margin-top: 4px; }
.og-wrap .warn { background: #fff3f3; border-left: 4px solid #e24b4a; padding: 12px 20px; margin: 16px 0; border-radius: 0 6px 6px 0; font-size: 0.88rem; line-height: 1.8; color: #600; }
.og-wrap .faq-item { border-bottom: 1px solid #eee; padding: 22px 0; }
.og-wrap .faq-item:last-child { border-bottom: none; }
.og-wrap .faq-q { font-weight: 700; color: #111; font-size: 0.98rem; margin-bottom: 12px; display: flex; gap: 10px; align-items: flex-start; }
.og-wrap .faq-q .tag { background: #2d7dd2; color: #fff; font-size: 0.72rem; font-weight: 700; padding: 2px 7px; border-radius: 4px; flex-shrink: 0; margin-top: 2px; }
.og-wrap .faq-a { font-size: 0.93rem; line-height: 1.9; color: #444; padding-left: 22px; }
.og-wrap .faq-source { font-size: 0.8rem; color: #bbb; margin-top: 6px; }
.og-wrap .conclusion-box { background: #1a3a5c; border-radius: 10px; padding: 26px 28px; margin: 36px 0 20px; color: #fff; }
.og-wrap .conclusion-box .title { font-size: 0.85rem; color: #8ab0d4; margin-bottom: 12px; font-weight: 600; }
.og-wrap .conclusion-box .body { font-size: 1rem; line-height: 1.9; color: #e8f1fb; }
.og-wrap .conclusion-box .body strong { color: #fff; }
.og-wrap .conclusion-box .cta { margin-top: 16px; padding-top: 14px; border-top: 1px solid #2d5a8a; font-size: 0.88rem; color: #8ab0d4; }
.og-wrap .conclusion-box .cta a { color: #79b8f8; text-decoration: none; }
.og-wrap .disclaimer { font-size: 0.79rem; color: #bbb; background: #f8f8f8; padding: 14px 18px; border-radius: 6px; line-height: 1.72; margin-top: 28px; }

@media (max-width: 640px) {
  .og-wrap .answer-box { padding: 16px 18px; }
  .og-wrap .answer-box .a { font-size: 0.97rem; }
  .og-wrap h2 { font-size: 1.05rem; margin: 32px 0 12px; }
  .og-wrap p { font-size: 0.92rem; }
  .og-wrap .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 16px 0 24px; }
  .og-wrap .table-wrap table { margin: 0; min-width: 480px; }
  .og-wrap .stat-row { grid-template-columns: 1fr 1fr; gap: 8px; }
  .og-wrap .stat-box .num { font-size: 1rem; }
  .og-wrap .info-box { padding: 12px 14px; font-size: 0.88rem; }
  .og-wrap .conclusion-box { padding: 20px 18px; }
  .og-wrap .conclusion-box .body { font-size: 0.92rem; }
  .og-wrap .faq-a { padding-left: 14px; font-size: 0.88rem; }
  .og-wrap .disclaimer { font-size: 0.76rem; padding: 12px 14px; }
}
`;
```

---

## 4. 프론트 수정 — `frandoor/page.tsx`

블로그 결과물 프리뷰 영역에서:

```tsx
// 기존: 마크다운 렌더링
// 변경: HTML 직접 렌더링

// frandoor 채널일 때
<div className="og-wrap" dangerouslySetInnerHTML={{ __html: blogResult.content }} />

// 프리뷰 모드에서 OG_WRAP_CSS를 <style>로 주입
import { OG_WRAP_CSS } from "@/constants/blogCssTemplate";
```

---

## 5. READER_STAGE 연동 — 구조 변화

### awareness (인지 단계) — "소자본 창업 뭐가 좋아?"
```
answer-box: 업종별 평균 비용 요약 (브랜드 특정 수치 아닌 업종 비교)
본론: 업종 비교 → 왜 분식인가 → 이 브랜드 소개는 중반부터
결론: "비용 구조가 맞다면 다음은 →"
```

### consideration (비교 단계) — "김밥 프랜차이즈 추천" / "오공김밥 vs 경쟁브랜드"
```
answer-box: 브랜드 핵심 수치 + "업계 평균 대비 OO%" 비교
본론: 비교 기준 3가지 제시 → 각 기준별 표(업계평균 vs 해당 브랜드) → 차별점
결론: "이 기준에 맞다면 →"
→ 경쟁 브랜드 실명 절대 금지. "업계 평균", "A브랜드" 표현만
```

### decision (결정 단계) — "오공김밥 창업비용"
```
answer-box: 총비용 + 실투자금 즉시 제시
본론: 비용 항목표 → 대출 구조 → 매출 → 자동화
결론: "가맹문의 →"
→ frandoor.tistory.com/1이 이 단계의 정답 예시
```

---

## 6. 작업 순서

```
Step 1: constants/blogCssTemplate.ts 생성 (CSS 상수)
Step 2: utils/promptBuilder.ts 수정
  - CHANNEL.frandoor 프롬프트 교체 (HTML 출력 구조)
  - CHANNEL.tistory 프롬프트 교체 (CSS+JSON-LD 포함 HTML)
  - JSON_OUTPUT 수정
  - READER_STAGE 각 단계별 answer-box 구조 힌트 추가
Step 3: frandoor/page.tsx 프리뷰 영역 수정 (HTML 렌더링)
Step 4: 테스트
  - "오공김밥 창업비용" (decision/transactional) → frandoor.tistory.com/1과 비교
  - "오공김밥 vs 경쟁브랜드" (consideration/navigational) → 비교 구조 확인
  - "소자본 창업 추천" (awareness/informational) → 업종 비교 구조 확인
```

---

## 7. 하지 말 것

- blog-generate/route.ts 수정 금지 (프롬프트만 바꾸면 됨)
- naver/medium 채널 프롬프트는 이 스펙에서 안 건드림 (별도 BLOG_CONVERT_SPEC 참고)
- og-wrap CSS를 AI에게 매번 생성시키지 말 것 (토큰 낭비 + 일관성 깨짐)
- `<script>` 태그를 frandoor 채널 content에 넣지 말 것 (JSON-LD는 schema_markup 필드로 분리)

---

## 8. 핵심 원칙 — 왜 이 구조인가

**"AI가 인용하기 쉬운 글 = 사람이 읽기 좋은 글"**

1. **결론부터 (answer-box)**: ChatGPT, Perplexity가 "오공김밥 창업비용" 검색 시 이 블록을 통째로 인용
2. **FAQ 구조**: AI가 question-answer 쌍을 1:1로 매칭해서 답변에 사용
3. **stat-row 수치**: AI가 정량 데이터를 정확히 추출 (구조화된 HTML > 산문 속 숫자)
4. **출처 명시 (.source)**: AI가 신뢰도 판단 시 출처 유무가 핵심 요소
5. **JSON-LD 스키마**: 기계가 읽는 정형 데이터. 크롤러가 HTML 파싱 없이도 데이터 추출

---

*BLOG_OUTPUT_UPGRADE_SPEC v1.0 | 2026.04.09 | 프랜도어 | Claude Code 전달용*
*이 파일 + BLOG_CONVERT_SPEC.md 두 개를 함께 전달할 것*
