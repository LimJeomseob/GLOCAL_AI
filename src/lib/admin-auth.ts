import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminUser } from "@/lib/types";

/**
 * 현재 로그인 세션이 있고, 해당 이메일이 admin_users allowlist(RLS 대상)에 존재하면
 * 관리자 정보를 반환한다. 세션이 없거나 allowlist에 없으면 null.
 */
export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) return null;

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("id, email, role")
    .eq("email", user.email)
    .maybeSingle();

  if (!adminRow) return null;

  return adminRow as AdminUser;
}
