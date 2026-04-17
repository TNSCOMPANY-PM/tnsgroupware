This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 공공데이터 API 환경변수

데이터시트(DS-01~30) 생성과 블로그 팩트체크에 사용하는 공공데이터 API 키. `.env.example` 참조.

| 환경변수 | 출처 | 사용처 |
|---|---|---|
| FTC_FRANCHISE_KEY | franchise.ftc.go.kr | 정보공개서 목록/목차/본문 |
| FTC_DATAPORTAL_KEY | apis.data.go.kr/1130000 | 공정위 가맹·업종·기업집단 API 18+종 |
| TOUR_API_KEY | 공공데이터포털 (한국관광공사 TourAPI 4.0) | DS-17, DS-20 |
| NTS_API_KEY | 공공데이터포털 (국세청 사업자상태) | DS-18, DS-21 |
| SBIZ_API_KEY | 공공데이터포털 (소상공인시장진흥공단 상가정보) | DS-18, DS-19 |
| KOSIS_API_KEY | kosis.kr 공유서비스 | DS-19, DS-30, 블로그 |
| FOODSAFETY_API_KEY | foodsafetykorea.go.kr | DS-29, 블로그 |
| LAW_API_KEY | law.go.kr (OC 값) | DS-12, DS-13, DS-14 |

자세한 매트릭스는 [AUDIT_PUBLIC_API.md](AUDIT_PUBLIC_API.md) 참조.
