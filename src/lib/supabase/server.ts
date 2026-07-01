import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 서버 컴포넌트 / 라우트 핸들러 / 서버 액션에서 사용하는 Supabase 클라이언트.
 * 로그인한 관리자의 세션(쿠키)을 그대로 사용하므로, RLS 정책이 그대로 적용된다.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server Component 에서 호출된 경우 middleware가 세션 갱신을 담당하므로 무시
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Server Component 에서 호출된 경우 middleware가 세션 갱신을 담당하므로 무시
          }
        },
      },
    }
  );
}
