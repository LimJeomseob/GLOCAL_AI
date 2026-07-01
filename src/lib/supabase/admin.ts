import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service Role 키를 사용하는 서버 전용 클라이언트. RLS를 우회하므로
 * - 신청내역조회(성명+연락처 일치 검증은 코드에서 직접 수행)
 * - 수료증 PDF Storage 업로드/서명 URL 발급
 * 등 명확히 필요한 서버 라우트에서만 사용한다. 절대 클라이언트 번들에 포함되지 않도록 주의.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL 환경변수가 설정되지 않았습니다."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
