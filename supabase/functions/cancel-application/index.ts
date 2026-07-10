// 신청 취소 Edge Function (신청 포털 '신청내역조회' 탭).
// applications 테이블은 RLS로 공개 UPDATE가 차단되어 있으므로, lookup/issue-certificate와
// 동일하게 이 함수에서만 Service Role로 "성명+연락처가 정확히 일치하는 본인 신청 건"을
// 검증한 뒤 status를 '취소'로 변경한다. 실제 행 삭제는 관리자 포털에서만 가능하다.
// '취소' 상태는 정원 집계(get_workshop_availability, 정원 트리거)에서 제외되므로
// 취소 즉시 해당 회차의 자리가 반환된다.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";

const PHONE_REGEX = /^01[0-9]-?\d{3,4}-?\d{4}$/;

const cancelSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().regex(PHONE_REGEX),
  applicationId: z.string().uuid(),
});

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

/** 본인 취소가 허용되는 상태 — '이수'/'취소'는 불가 */
const CANCELLABLE_STATUSES = ["신청완료", "대기"];

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const json = await req.json().catch(() => null);
  const parsed = cancelSchema.safeParse(json);
  if (!parsed.success) {
    return jsonResponse({ error: "입력값을 확인해 주세요." }, 400);
  }

  const { name, phone, applicationId } = parsed.data;
  const normalizedPhone = normalizePhone(phone);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { data: application, error: appError } = await supabase
    .from("applications")
    .select("id, name, phone, status, workshop:workshops(start_at)")
    .eq("id", applicationId)
    .maybeSingle();

  if (appError) {
    return jsonResponse({ error: "조회 중 오류가 발생했습니다." }, 500);
  }

  // 존재 여부를 드러내지 않도록 미존재/본인 불일치를 같은 메시지로 처리한다.
  const identityMismatch =
    !application ||
    application.name !== name ||
    normalizePhone(application.phone) !== normalizedPhone;
  if (identityMismatch) {
    return jsonResponse(
      { error: "일치하는 신청 내역이 없습니다. 성명과 연락처를 확인해 주세요." },
      404
    );
  }

  if (application.status === "취소") {
    return jsonResponse({ error: "이미 취소된 신청입니다." }, 400);
  }
  if (!CANCELLABLE_STATUSES.includes(application.status)) {
    return jsonResponse({ error: "이수 완료된 신청은 취소할 수 없습니다." }, 400);
  }

  const workshop = Array.isArray(application.workshop)
    ? application.workshop[0]
    : application.workshop;
  if (!workshop) {
    return jsonResponse({ error: "회차 정보를 확인할 수 없습니다." }, 500);
  }

  // 취소는 특강 시작 전까지만 허용한다(서버 시각 기준 — 클라이언트 게이팅은 표시용일 뿐).
  if (Date.now() >= new Date(workshop.start_at).getTime()) {
    return jsonResponse({ error: "특강이 시작된 이후에는 취소할 수 없습니다." }, 400);
  }

  // 조회-갱신 사이에 상태가 바뀌어도(관리자 이수처리·중복 취소) 덮어쓰지 않도록
  // UPDATE에 상태 조건을 다시 건다 — 조건 불일치면 0행 매칭으로 안전하게 실패한다.
  const { data: updated, error: updateError } = await supabase
    .from("applications")
    .update({ status: "취소" })
    .eq("id", applicationId)
    .in("status", CANCELLABLE_STATUSES)
    .select("id")
    .maybeSingle();

  if (updateError) {
    return jsonResponse(
      { error: "취소 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      500
    );
  }
  if (!updated) {
    return jsonResponse({ error: "취소할 수 없는 상태로 변경되었습니다. 다시 조회해 주세요." }, 400);
  }

  return jsonResponse({ ok: true, applicationId, status: "취소" });
});
