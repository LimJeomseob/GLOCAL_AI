"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAdminSession } from "@/lib/useAdminSession";
import { AdminNav } from "@/components/admin/AdminNav";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { PROGRAM_NAME } from "@/lib/constants";

export default function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = useAdminSession();
  const router = useRouter();
  const pathname = usePathname();

  // 서버 미들웨어가 없으므로(정적 배포) 클라이언트에서 인증 실패 시 로그인 화면으로 이동시킨다.
  // 실제 데이터 접근 통제는 Supabase RLS(is_admin())가 이중으로 담당한다(PRD §6.1).
  useEffect(() => {
    if (session.status === "unauthorized") {
      router.replace(`/admin/login?redirectedFrom=${encodeURIComponent(pathname)}`);
    }
  }, [session.status, router, pathname]);

  if (session.status !== "authorized") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500" role="status">
          {session.status === "loading" ? "로그인 확인 중..." : "로그인 화면으로 이동합니다..."}
        </p>
      </div>
    );
  }

  const { admin } = session;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-bold text-white"
            >
              GNU
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-xs font-medium text-slate-500">관리자 포털</span>
              <span className="text-sm font-bold text-brand sm:text-base">{PROGRAM_NAME}</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{admin.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <AdminNav />
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
