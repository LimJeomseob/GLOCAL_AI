// 공개 Edge Function 3종(lookup / cancel-application / issue-certificate)이 공유하는
// 본인확인 규칙. 세 함수에 흩어져 있던 전화번호 정규식·정규화·일치 검사를 한곳으로 모아,
// 본인확인 기준이 함수마다 어긋나지 않도록 한다.
import { z } from "npm:zod@3.23.8";

/** 한국 휴대폰 형식 — src/lib/validation.ts의 PHONE_REGEX와 동일하게 유지할 것 */
export const PHONE_REGEX = /^01[0-9]-?\d{3,4}-?\d{4}$/;

/** 성명+연락처 본인확인 입력 */
export const identitySchema = z.object({
  name: z.string().trim().min(1).max(50),
  phone: z.string().trim().regex(PHONE_REGEX),
});

/** applicationId까지 필요한 함수(취소·수료증 발급)용 확장 스키마 */
export const identityWithApplicationSchema = identitySchema.extend({
  applicationId: z.string().uuid(),
});

/** 저장된 연락처는 하이픈 유무가 섞일 수 있으므로 숫자만 남겨 비교한다. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

/**
 * 신청 건이 본인 것인지 확인한다.
 * 미존재와 불일치를 구분하지 않는 것은 호출부의 책임이다 — 존재 여부가 드러나면
 * 신청 여부 자체가 정보가 되므로, 두 경우 모두 같은 메시지로 응답해야 한다.
 *
 * 반환 타입을 타입 가드로 선언해, 호출부에서 조기 반환한 뒤 application이 non-null로
 * 좁혀지도록 한다(인라인 검사로 얻던 내로잉을 그대로 유지하기 위함).
 */
export function matchesIdentity<T extends { name: string; phone: string }>(
  application: T | null | undefined,
  name: string,
  phone: string
): application is T {
  if (!application) return false;
  return (
    application.name === name &&
    normalizePhone(application.phone) === normalizePhone(phone)
  );
}

/** 본인확인 실패 시 공통 응답 문구 — 세 함수가 동일한 문구를 쓰도록 고정한다. */
export const IDENTITY_MISMATCH_MESSAGE =
  "일치하는 신청 내역이 없습니다. 성명과 연락처를 확인해 주세요.";
