import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/auth/callback"];

/**
 * 관리자 포털(/admin/**) 접근 통제 1차 게이트.
 * - 세션 없음 → /admin/login 리다이렉트
 * - 세션은 있으나 admin_users allowlist에 없음 → /admin/login 리다이렉트(접근 차단)
 * 2차 통제는 Supabase RLS(§6.1)가 데이터 레벨에서 담당한다.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });

  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/admin")) return response;
  if (PUBLIC_ADMIN_PATHS.some((p) => pathname.startsWith(p))) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectToLogin = () => {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(loginUrl);
  };

  if (!user || !user.email) return redirectToLogin();

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();

  if (!adminRow) return redirectToLogin();

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
