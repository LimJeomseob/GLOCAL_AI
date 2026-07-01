"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { PROGRAM_NAME } from "@/lib/constants";

const ERROR_MESSAGES: Record<string, string> = {
  not_allowlisted:
    "관리자로 등록되지 않은 계정입니다. 접근 권한이 필요하면 관리자에게 문의해 주세요.",
  auth_failed: "로그인에 실패했습니다. 다시 시도해 주세요.",
  missing_code: "로그인 요청이 올바르지 않습니다. 다시 시도해 주세요.",
};

function LoginContent() {
  const searchParams = useSearchParams();
  const redirectedFrom = searchParams.get("redirectedFrom") ?? "/admin/applicants";
  const queryError = searchParams.get("error");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    queryError ? ERROR_MESSAGES[queryError] ?? "로그인에 실패했습니다." : null
  );

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${siteUrl}/admin/auth/callback?redirectedFrom=${encodeURIComponent(
          redirectedFrom
        )}`,
      },
    });

    if (signInError) {
      setError("로그인 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-brand text-sm font-bold text-white">
          GNU
        </div>
        <h1 className="text-lg font-bold text-slate-900">관리자 로그인</h1>
        <p className="mt-2 text-sm text-slate-500">{PROGRAM_NAME} 관리자 포털</p>
        <p className="mt-1 text-xs text-slate-400">
          허용된 구글 계정으로만 로그인할 수 있습니다.
        </p>

        <Button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="mt-6 w-full"
          size="lg"
        >
          {loading ? "이동 중..." : "Google 계정으로 로그인"}
        </Button>

        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
