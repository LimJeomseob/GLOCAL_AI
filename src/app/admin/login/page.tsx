"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/lib/useAdminSession";
import { Button } from "@/components/ui/Button";
import { PROGRAM_NAME } from "@/lib/constants";

function LoginContent() {
  const router = useRouter();
  const session = useAdminSession();
  const searchParams = useSearchParams();
  const redirectedFrom = searchParams.get("redirectedFrom") ?? "/admin/applicants";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedOutNotice, setSignedOutNotice] = useState(false);

  // 정적 배포이므로 구글 로그인 후에도 이 페이지로 돌아온다(#access_token은
  // Supabase 클라이언트의 detectSessionInUrl이 자동으로 파싱). 세션이 확인되면
  // allowlist(admin_users) 통과 여부에 따라 이동하거나 안내한다.
  useEffect(() => {
    if (session.status === "authorized") {
      router.replace(redirectedFrom);
      return;
    }
    if (session.status === "unauthorized") {
      const supabase = createSupabaseBrowserClient();
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          // 세션은 있지만 admin_users allowlist에 없는 계정 → 로그아웃 처리
          supabase.auth.signOut();
          setSignedOutNotice(true);
        }
      });
    }
  }, [session.status, redirectedFrom, router]);

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const redirectTo = `${window.location.origin}${basePath}/admin/login/?redirectedFrom=${encodeURIComponent(
      redirectedFrom
    )}`;

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
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
          disabled={loading || session.status === "loading"}
          className="mt-6 w-full"
          size="lg"
        >
          {loading ? "이동 중..." : "Google 계정으로 로그인"}
        </Button>

        {signedOutNotice && (
          <p role="alert" className="mt-4 text-sm font-medium text-red-600">
            관리자로 등록되지 않은 계정입니다. 접근 권한이 필요하면 관리자에게 문의해 주세요.
          </p>
        )}
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
