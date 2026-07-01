import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/**
 * 정적 export(GitHub Pages) 배포이므로 서버가 없다 — 모든 Supabase 접근은
 * 이 브라우저 클라이언트(anon key, 세션은 localStorage에 저장)로만 이루어진다.
 * 관리자 전용 작업(신청내역조회, 수료증 발급 등 RLS를 우회해야 하는 로직)은
 * Supabase Edge Function(supabase/functions/*)에서 처리한다.
 */
export function createSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  browserClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );

  return browserClient;
}
