import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "일과 삶을 바꾸는 생성형 AI 실무과정 | 경상국립대학교 글로컬대학30",
  description:
    "경상국립대학교 글로컬대학30 사업 — 2026학년도 모두의 AI를 위한 7월 AI활용 특강 신청·관리 포털",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
      </head>
      <body className="min-h-screen font-sans antialiased text-slate-900 bg-slate-50">
        <a href="#main-content" className="skip-link">
          본문 바로가기
        </a>
        {children}
      </body>
    </html>
  );
}
