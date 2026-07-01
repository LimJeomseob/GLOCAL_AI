"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-tables";
import type { AdminUser } from "@/lib/types";

export type AdminSessionState =
  | { status: "loading" }
  | { status: "authorized"; admin: AdminUser }
  | { status: "unauthorized" };

/**
 * 정적 배포(서버 미들웨어 없음)이므로 관리자 접근 통제는 전적으로 클라이언트에서
 * 세션을 확인 + admin_users allowlist를 재조회하는 것으로 이루어진다(PRD §6.1).
 * 실제 데이터 보호는 이 훅이 아니라 Supabase RLS(is_admin())가 담당하므로,
 * 이 훅은 어디까지나 UX 상 미인가 사용자를 로그인 화면으로 안내하는 역할이다.
 */
export function useAdminSession(): AdminSessionState {
  const [state, setState] = useState<AdminSessionState>({ status: "loading" });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let active = true;

    async function resolve() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.email) {
        if (active) setState({ status: "unauthorized" });
        return;
      }

      const { data: adminRow } = await supabase
        .from(TABLES.ADMIN_USERS)
        .select("id, email, role")
        .eq("email", session.user.email)
        .maybeSingle();

      if (!active) return;

      if (!adminRow) {
        setState({ status: "unauthorized" });
        return;
      }

      setState({ status: "authorized", admin: adminRow as AdminUser });
    }

    resolve();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      resolve();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
