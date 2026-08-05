// _shared/cors.ts 테스트
//   deno test --allow-env  (supabase/functions 디렉터리에서)
import { assertEquals } from "jsr:@std/assert@1";
import { corsHeadersFor, handleCorsPreflight } from "./cors.ts";

function requestWithOrigin(origin?: string, method = "POST"): Request {
  const headers = new Headers();
  if (origin) headers.set("Origin", origin);
  return new Request("https://example.functions.supabase.co/lookup", { method, headers });
}

/** 각 케이스마다 환경변수를 세팅하고 원복한다. */
function withAllowedOrigins(value: string | null, fn: () => void) {
  const previous = Deno.env.get("ALLOWED_ORIGINS");
  if (value === null) {
    Deno.env.delete("ALLOWED_ORIGINS");
  } else {
    Deno.env.set("ALLOWED_ORIGINS", value);
  }
  try {
    fn();
  } finally {
    if (previous === undefined) Deno.env.delete("ALLOWED_ORIGINS");
    else Deno.env.set("ALLOWED_ORIGINS", previous);
  }
}

Deno.test("ALLOWED_ORIGINS 미설정이면 기존 동작대로 모든 origin을 허용한다", () => {
  withAllowedOrigins(null, () => {
    const headers = corsHeadersFor(requestWithOrigin("https://evil.example"));
    assertEquals(headers["Access-Control-Allow-Origin"], "*");
  });
});

Deno.test("빈 문자열만 있으면 미설정과 같이 취급한다", () => {
  withAllowedOrigins("   ", () => {
    const headers = corsHeadersFor(requestWithOrigin("https://evil.example"));
    assertEquals(headers["Access-Control-Allow-Origin"], "*");
  });
});

Deno.test("허용 목록에 있는 origin은 그대로 반사한다", () => {
  withAllowedOrigins("https://gnu.github.io,http://localhost:3000", () => {
    const headers = corsHeadersFor(requestWithOrigin("https://gnu.github.io"));
    assertEquals(headers["Access-Control-Allow-Origin"], "https://gnu.github.io");
    // origin별로 응답이 달라지므로 캐시 오염을 막는 Vary가 필요하다.
    assertEquals(headers["Vary"], "Origin");
  });
});

Deno.test("공백이 섞인 목록도 정상 처리한다", () => {
  withAllowedOrigins(" https://a.example , https://b.example ", () => {
    const headers = corsHeadersFor(requestWithOrigin("https://b.example"));
    assertEquals(headers["Access-Control-Allow-Origin"], "https://b.example");
  });
});

Deno.test("허용 목록에 없는 origin에는 ACAO 헤더를 붙이지 않는다(브라우저가 차단)", () => {
  withAllowedOrigins("https://gnu.github.io", () => {
    const headers = corsHeadersFor(requestWithOrigin("https://evil.example"));
    assertEquals(headers["Access-Control-Allow-Origin"], undefined);
    assertEquals(headers["Vary"], "Origin");
  });
});

Deno.test("Origin 헤더가 없는 요청(curl 등)에도 ACAO를 붙이지 않는다", () => {
  withAllowedOrigins("https://gnu.github.io", () => {
    const headers = corsHeadersFor(requestWithOrigin(undefined));
    assertEquals(headers["Access-Control-Allow-Origin"], undefined);
  });
});

Deno.test("부분 문자열 일치로 통과하지 않는다", () => {
  withAllowedOrigins("https://gnu.github.io", () => {
    // 접두사가 같은 다른 도메인
    const spoof = corsHeadersFor(requestWithOrigin("https://gnu.github.io.evil.example"));
    assertEquals(spoof["Access-Control-Allow-Origin"], undefined);
  });
});

Deno.test("preflight(OPTIONS)도 동일한 origin 규칙을 따른다", () => {
  withAllowedOrigins("https://gnu.github.io", () => {
    const allowed = handleCorsPreflight(requestWithOrigin("https://gnu.github.io", "OPTIONS"));
    assertEquals(allowed?.headers.get("Access-Control-Allow-Origin"), "https://gnu.github.io");

    const denied = handleCorsPreflight(requestWithOrigin("https://evil.example", "OPTIONS"));
    assertEquals(denied?.headers.get("Access-Control-Allow-Origin"), null);
  });
});

Deno.test("OPTIONS가 아니면 preflight 처리를 하지 않는다", () => {
  assertEquals(handleCorsPreflight(requestWithOrigin("https://gnu.github.io", "POST")), null);
});
