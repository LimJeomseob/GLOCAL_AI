/**
 * 회차(workshops) 로딩·신청상태 산출 공통 로직.
 * 소개 탭(프로그램 안내 카드/신청기간)과 신청 탭이 동일한 DB 소스·판정을 쓰도록
 * 단일 출처로 모아 실시간 연동을 보장한다.
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-tables";
import type { Workshop } from "@/lib/types";

export interface WorkshopStatus {
  remaining: number;
  isNotYetOpen: boolean; // 신청 시작(apply_open_at) 이전 → "신청 예정"
  isClosed: boolean; // 정원 초과 또는 마감(deadline) 경과 → "마감"
}

/**
 * 신청 가능 구간(apply_open_at ~ deadline)과 정원을 기준으로 신청 상태를 산출한다.
 * apply_open_at/deadline이 없거나 유효하지 않은 경우(예: 마이그레이션 미적용)는
 * 해당 경계를 강제하지 않는다(NaN 비교 → false).
 */
export function deriveWorkshopStatus(
  workshop: Pick<Workshop, "capacity" | "apply_open_at" | "deadline">,
  appliedCount: number,
  now: number
): WorkshopStatus {
  const remaining = workshop.capacity - appliedCount;
  const isNotYetOpen = now < new Date(workshop.apply_open_at).getTime();
  const isDeadlinePassed = now > new Date(workshop.deadline).getTime();
  const isClosed = remaining <= 0 || isDeadlinePassed;
  return { remaining, isNotYetOpen, isClosed };
}

export interface WorkshopsWithAvailability {
  workshops: Workshop[];
  /** workshop_id → 유효 신청건수(신청완료/이수) */
  appliedCountByWorkshopId: Map<string, number>;
}

/**
 * workshops 전체 + 공개 정원현황(get_workshop_availability)을 함께 로드한다.
 * 실패 시 예외를 던진다.
 */
export async function fetchWorkshopsWithAvailability(): Promise<WorkshopsWithAvailability> {
  const supabase = createSupabaseBrowserClient();

  const [{ data: workshops, error: workshopsError }, { data: availability, error: rpcError }] =
    await Promise.all([
      supabase
        .from(TABLES.WORKSHOPS)
        .select("*")
        .order("round", { ascending: true })
        .returns<Workshop[]>(),
      supabase.rpc("get_workshop_availability"),
    ]);

  if (workshopsError || rpcError) {
    throw new Error("회차 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  // get_workshop_availability()의 applied_count는 Postgres bigint이며 PostgREST가
  // JSON 정밀도 손실 방지를 위해 문자열로 직렬화하므로 명시적으로 숫자 변환한다.
  const appliedCountByWorkshopId = new Map<string, number>(
    (availability ?? []).map(
      (row: { workshop_id: string; applied_count: number | string }) => [
        row.workshop_id,
        Number(row.applied_count),
      ]
    )
  );

  return { workshops: workshops ?? [], appliedCountByWorkshopId };
}
