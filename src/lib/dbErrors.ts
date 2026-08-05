/**
 * Supabase(PostgREST) 오류를 사용자에게 보여줄 한국어 문구로 변환한다.
 *
 * 원본 error.message를 그대로 노출하면 Postgres/PostgREST의 영어 원문과 내부 스키마 정보
 * (제약 이름·컬럼명 등)가 신청자 화면에 그대로 드러난다. 알고 있는 오류만 명시적으로
 * 매핑하고, 나머지는 일반 문구로 대체한다.
 *
 * P0001~P0005는 check_application_capacity() 트리거가 raise하는 코드다
 * (supabase/migrations/0012_public_insert_hardening.sql).
 */

interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
}

const MESSAGE_BY_CODE: Record<string, string> = {
  // ── 신청 검증 트리거 ──────────────────────────────────────────────
  P0001: "선택한 회차를 찾을 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.",
  P0002: "신청이 마감된 회차입니다. 다른 회차를 선택해 주세요.",
  P0003: "정원이 모두 찼습니다. 다른 회차를 선택해 주세요.",
  P0004: "아직 신청 기간이 아닙니다. 신청 시작 시각 이후에 다시 시도해 주세요.",
  P0005:
    "이미 해당 회차에 신청된 연락처입니다. 신청내역조회 탭에서 기존 신청 내역을 확인해 주세요.",

  // ── Postgres 표준 오류 ────────────────────────────────────────────
  "23505": "이미 신청된 내역이 있습니다. 신청내역조회 탭에서 확인해 주세요.",
  "23514": "입력값을 다시 확인해 주세요.",
  "23503": "선택한 회차를 찾을 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.",
  "42501": "권한이 없어 처리할 수 없습니다.",
};

const FALLBACK_MESSAGE =
  "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요. 문제가 계속되면 담당자에게 문의해 주세요.";

/** 알고 있는 오류 코드면 안내 문구를, 아니면 일반 문구를 돌려준다. */
export function toUserMessage(error: unknown, fallback: string = FALLBACK_MESSAGE): string {
  const code = (error as PostgrestLikeError | null)?.code;
  if (typeof code === "string" && MESSAGE_BY_CODE[code]) {
    return MESSAGE_BY_CODE[code];
  }
  return fallback;
}

/**
 * 관리자 화면처럼 원인 파악이 필요한 곳에서 쓰는 변형.
 * 매핑된 코드가 있으면 그 문구를, 없으면 원본 message를 그대로 보여 준다.
 */
export function toAdminMessage(error: unknown, fallback = "알 수 없는 오류"): string {
  const err = error as PostgrestLikeError | null;
  const code = err?.code;
  if (typeof code === "string" && MESSAGE_BY_CODE[code]) {
    return MESSAGE_BY_CODE[code];
  }
  return err?.message || fallback;
}
