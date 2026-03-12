import type { Metadata } from "next";
import "@fontsource/pretendard/400.css";
import "@fontsource/pretendard/500.css";
import "@fontsource/pretendard/600.css";
import "@fontsource/pretendard/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "TNS 그룹웨어",
  description: "TNS컴퍼니 통합 그룹웨어",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="h-screen w-full overflow-hidden font-sans antialiased text-slate-800">
        <div className="fixed inset-0 z-[-1] bg-[#f8fafc] overflow-hidden">
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-200/15 blur-[120px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-blue-100/20 blur-[100px]" />
          <div className="absolute top-[40%] left-[30%] w-[400px] h-[400px] rounded-full bg-slate-200/30 blur-[120px]" />
        </div>
        {children}
      </body>
    </html>
  );
}
