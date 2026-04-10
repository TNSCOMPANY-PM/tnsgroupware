# 블로그 변환 결과물 핫픽스 — Claude Code 구현 SPEC

> 플랫폼별 변환 탭이 구현됐지만, 결과물이 의도와 다르게 나오고 있음.
> 이 문서는 BLOG_CONVERT_SPEC.md의 보충 지시서.

---

## 0. 현재 문제

| 플랫폼 | 현재 상태 | 기대 상태 |
|--------|----------|----------|
| 티스토리 | FAQ JSON 데이터 raw 출력 | **완성된 HTML** (og-wrap CSS + 본문 + FAQ + JSON-LD 전부 포함) |
| 네이버 | FAQ 텍스트만 출력 | **단순화된 본문 전체** + FAQ 텍스트 |
| Medium | FAQ JSON raw 출력 | **Markdown 변환된 본문 전체** + FAQ |

**공통 문제**: content(본문)가 변환되지 않고, faq 배열만 표시되고 있음.

---

## 1. 수정사항

### 1-1. 변환 대상은 content(본문 HTML) 전체

현재 faq 배열만 플랫폼별로 보여주고 있는 것 같음.
변환 API는 `blogResult.content` (본문 HTML 전체)를 입력받아서 플랫폼별로 변환해야 함.

```
입력: blogResult.content (Frandoor용 풀 HTML)
     + blogResult.faq (FAQ 배열)
     + blogResult.title
     + blogResult.schema_markup
     + blogResult.meta_description

출력: 플랫폼별 변환된 content 전체
```

### 1-2. 티스토리 출력 형태

티스토리 HTML 편집기에 **그대로 붙여넣기**할 수 있는 완성된 HTML:

```html
<style>
  /* og-wrap CSS 전체 (constants/blogCssTemplate.ts에서 가져옴) */
</style>

<script type="application/ld+json">
  /* FAQPage 스키마 */
</script>
<script type="application/ld+json">
  /* Organization 스키마 */
</script>

<div class="og-wrap">
  <!-- answer-box -->
  <!-- 본문 H2 섹션들 -->
  <!-- FAQ 섹션 -->
  <!-- conclusion-box -->
  <!-- disclaimer -->
</div>
```

### 1-3. 네이버 출력 형태

네이버 스마트에디터에 붙여넣기할 수 있는 **단순 텍스트**:

```
[제목]

[결론부터]
오공김밥 창업 총비용 약 6,500만원.
대출 구조 활용 시 실제 내 돈은 약 1,500만원입니다.

[본문 - 스타일 태그 제거, p/br/strong/table만 남김]

[자주 묻는 질문]
Q. 오공김밥 창업비용이 얼마예요?
A. 총 창업비용은 6,500만원입니다...

Q. 오공김밥 마진이 어떻게 돼요?
A. 원가율 40%, 순마진 17~23%입니다...

[면책 문구]

#오공김밥창업비용 #소자본프랜차이즈 #분식프랜차이즈창업비용
```

### 1-4. Medium 출력 형태

Markdown:

```markdown
# 오공김밥 창업비용 완전 분석 2026

> 총비용 6,500만원, 실투자금 1,500만원. 대출 구조 활용 시.

## 창업비용, 뭐뭐 들어가는 건가요?

창업비용이라고 하면 "가맹비"만 생각하는 분들이 많습니다...

| 항목 | 내용 | 실제 비중 |
|------|------|----------|
| 가맹금 | 브랜드 사용 허가 비용 | 5~10% |
...

## 자주 묻는 질문

### Q. 오공김밥 창업비용이 얼마예요?
총 창업비용은 6,500만원입니다...

---
*출처: 공정거래위원회 정보공개서 기준*
```

---

## 2. 복사 버튼 — 플랫폼별로 다르게

### 티스토리
```
[HTML 복사] ← style + JSON-LD + og-wrap HTML 전체를 클립보드에 복사
[텍스트 복사] ← HTML 태그 제거한 텍스트만
[임시저장 발행] ← /api/geo/tistory/publish (visibility: 0)
```

### 네이버  
```
[복사] ← 단순 텍스트 (위 1-3 형태)
[네이버 열기] ← 네이버 블로그 에디터 새 창 오픈 (기존처럼)
```

### Medium
```
[Markdown 복사] ← 마크다운 텍스트
[텍스트 복사] ← 마크다운 문법 제거한 순수 텍스트
```

---

## 3. 프리뷰 영역

각 탭에서 변환 결과를 보여줄 때:

- **티스토리**: HTML 렌더링 프리뷰 (dangerouslySetInnerHTML). 실제 블로그에 올라갈 모습 그대로.
- **네이버**: 텍스트 프리뷰 (pre 또는 whitespace-pre-wrap)
- **Medium**: 마크다운 렌더링 프리뷰 (마크다운 파서 사용하거나, 단순 텍스트로)

---

## 4. 구현 우선순위

```
1. content 전체를 변환 대상으로 수정 (faq만이 아님)
2. 티스토리 HTML 복사 버튼 추가
3. 티스토리 프리뷰를 HTML 렌더링으로 변경
4. 네이버/Medium 변환 로직 수정
5. 각 플랫폼별 복사 버튼 분리
```

---

*BLOG_CONVERT_HOTFIX v1.0 | 2026.04.09 | 프랜도어 | BLOG_CONVERT_SPEC.md 보충용*
