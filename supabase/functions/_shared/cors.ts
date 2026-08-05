// GitHub Pages(정적 사이트)에서 브라우저가 직접 호출하므로 CORS 헤더가 필요하다.
//
// 범위에 대한 솔직한 정리: 이 함수들은 쿠키·세션을 쓰지 않으므로 CORS는 실질적인 보안
// 경계가 아니다. curl이나 서버 간 호출은 CORS를 아예 거치지 않는다. origin 제한이 막는
// 것은 "제3자 웹페이지가 방문자의 브라우저·IP로 이 API를 호출하는 것" 정도이며,
// 실제 남용 방어는 빈도 제한(_shared/rateLimit.ts)과 본인확인이 담당한다.
// 그래도 불필요하게 넓은 노출을 줄이는 심층 방어로서 origin을 좁힐 수 있게 해 둔다.
//
// 설정: Supabase 시크릿 ALLOWED_ORIGINS 에 쉼표로 구분해 등록한다.
//   supabase secrets set ALLOWED_ORIGINS="https://<user>.github.io,http://localhost:3000"
// 미설정이면 지금까지와 동일하게 모든 origin을 허용한다(배포가 조용히 깨지지 않도록).

const BASE_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** 미설정 경고를 한 번만 남기기 위한 플래그 */
let warnedMissingConfig = false;

/**
 * 허용 origin 목록을 읽는다. null이면 "모두 허용"(미설정).
 * 모듈 로드 시점이 아니라 호출 시점에 읽는다 — 테스트에서 설정을 바꿔가며 검증할 수 있고,
 * 시크릿이 나중에 주입되는 경우에도 반영된다.
 */
function getAllowedOrigins(): string[] | null {
  const raw = Deno.env.get("ALLOWED_ORIGINS")?.trim() ?? "";
  if (!raw) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn(
        "[cors] ALLOWED_ORIGINS가 설정되지 않아 모든 origin을 허용합니다. " +
          "배포 주소를 시크릿으로 등록하면 노출 범위를 좁힐 수 있습니다."
      );
    }
    return null;
  }
  const origins = raw.split(",").map((o) => o.trim()).filter(Boolean);
  return origins.length > 0 ? origins : null;
}

/**
 * 요청 origin에 맞는 CORS 헤더를 만든다.
 * 허용 목록이 설정된 경우, 목록에 없는 origin에는 Access-Control-Allow-Origin을 아예 붙이지
 * 않는다 — 브라우저가 응답을 차단한다.
 */
export function corsHeadersFor(req: Request): Record<string, string> {
  const allowedOrigins = getAllowedOrigins();
  if (!allowedOrigins) {
    return { ...BASE_HEADERS, "Access-Control-Allow-Origin": "*" };
  }

  const origin = req.headers.get("Origin");
  // origin별로 응답이 달라지므로 캐시가 섞이지 않게 Vary를 붙인다.
  const headers: Record<string, string> = { ...BASE_HEADERS, Vary: "Origin" };

  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(req),
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }
  return null;
}
