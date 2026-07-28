-- 7월 3차(효과적인 프롬프트 작성법, 온라인) 신청 마감시간 연장
-- 기존 2026-07-27 14:00 → 2026-07-29(수) 오전 10:00 KST (강의 시작 4시간 전까지 신청 허용)
-- 신청 차단은 DB 트리거(check_application_capacity)가 workshops.deadline으로 판정하므로
-- 이 업데이트가 실제 마감시간을 결정한다. 프론트 상수(constants.ts)도 동일 값으로 맞췄다.
update public.workshops
  set deadline = '2026-07-29T10:00:00+09:00'
  where round = 3;
