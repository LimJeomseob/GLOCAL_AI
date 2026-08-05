// 공개 Edge Function의 호출 빈도 제한. 상세 설계 근거는
// supabase/migrations/0013_rate_limit.sql 주석 참조.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** 슬라이딩 윈도우 길이 — DB 함수에 interval 문자열로 전달된다. */
const WINDOW = "10 minutes";

/**
 * 대상(성명) 기준 한도. 공격자는 실존 성명을 겨냥해야 하므로 위조가 불가능한 축이다.
 * 10분당 15회면 사람이 조회·취소·수료증 발급을 이어서 해도 남지만, 10^8 규모의
 * 휴대폰 번호 공간을 탐색하기에는 턱없이 부족하다.
 */
const IDENTITY_LIMIT = 15;

/**
 * 출처(IP) 기준 한도. 캠퍼스 NAT 뒤에서 다수 이용자가 IP를 공유할 수 있으므로 넉넉히 잡는다.
 * x-forwarded-for는 위조 가능성이 있어 보조 수단으로만 쓴다.
 */
const IP_LIMIT = 60;

/** 초과 시 프론트에 그대로 노출되는 문구(LookupForm 등이 body.error를 표시한다). */
export const RATE_LIMIT_MESSAGE =
  "요청이 너무 잦습니다. 잠시 후(약 10분 뒤) 다시 시도해 주세요.";

/** 개인정보를 빈도 제한 표에 남기지 않도록 키를 SHA-256으로 해시한다. */
async function hashKey(scope: string, value: string): Promise<string> {
  const data = new TextEncoder().encode(`${scope}:${value.toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${scope}:${hex.slice(0, 32)}`;
}

/**
 * 클라이언트 IP 추정. Supabase(Deno Deploy) 엣지가 x-forwarded-for를 설정하지만
 * 프록시 체인에 따라 위조 여지가 있으므로, 이 값만으로 차단을 판단하지 않는다.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * 이번 요청이 허용되는지 판단하고, 허용되면 시도를 기록한다.
 *
 * 실패 시 열어 두는(fail-open) 이유: 빈도 제한 저장소가 곤란한 상황이면 본 로직의
 * DB 조회도 어차피 실패한다. 여기서 막아 버리면 장애가 곧 전면 서비스 중단이 된다.
 * 대신 오류를 로그로 남겨 관측 가능하게 한다.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  req: Request,
  action: string,
  name: string
): Promise<{ allowed: boolean }> {
  try {
    const [identityBucket, ipBucket] = await Promise.all([
      hashKey(`${action}:id`, name.trim()),
      hashKey(`${action}:ip`, getClientIp(req)),
    ]);

    const [identityResult, ipResult] = await Promise.all([
      supabase.rpc("rate_limit_hit", {
        p_bucket: identityBucket,
        p_limit: IDENTITY_LIMIT,
        p_window: WINDOW,
      }),
      supabase.rpc("rate_limit_hit", {
        p_bucket: ipBucket,
        p_limit: IP_LIMIT,
        p_window: WINDOW,
      }),
    ]);

    if (identityResult.error || ipResult.error) {
      console.error(
        `[rateLimit] 빈도 제한 확인 실패 (action=${action}):`,
        identityResult.error ?? ipResult.error
      );
      return { allowed: true };
    }

    const allowed = identityResult.data !== false && ipResult.data !== false;
    if (!allowed) {
      // 어느 축에서 걸렸는지만 남긴다 — 성명·IP 원문은 기록하지 않는다.
      console.warn(
        `[rateLimit] 차단 (action=${action}, identity=${identityResult.data !== false ? "ok" : "exceeded"}, ip=${
          ipResult.data !== false ? "ok" : "exceeded"
        })`
      );
    }
    return { allowed };
  } catch (err) {
    console.error(`[rateLimit] 예기치 못한 오류 (action=${action}):`, err);
    return { allowed: true };
  }
}
