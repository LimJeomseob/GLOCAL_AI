import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { AdminNav } from "@/components/admin/AdminNav";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { PROGRAM_NAME } from "@/lib/constants";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 미들웨어(1차 통제)에 더해 서버 컴포넌트에서도 재확인(이중 통제, §6.1)
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

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
