-- 안내메세지 확인을 1·2·3차로 확장하며, 과거 카톡 발송 체크 컬럼(kakao_notice1..3_sent, 0005)을
-- 그대로 재사용한다 — 기존에 기록된 발송 결과가 새 1·2·3차 확인 컬럼에 즉시 반영된다.
-- 0008의 단일 notice_confirmed가 적용된 DB에서는 그 체크 이력을 1차로 병합하고 컬럼을 제거한다.
-- (0008을 적용하지 않은 DB에서는 아무 것도 하지 않는다 — 여러 번 실행해도 안전)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'applications' and column_name = 'notice_confirmed'
  ) then
    update public.applications set kakao_notice1_sent = true where notice_confirmed = true;
    alter table public.applications drop column notice_confirmed;
  end if;
end $$;
