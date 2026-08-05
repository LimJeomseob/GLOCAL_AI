-- ============================================================================
-- 0014_anonymize_expired_applications.sql 회귀 테스트
--
-- 보유기간이 지난 신청 건만 익명화되고, 통계용 값(회차·상태·발급여부)은 남으며,
-- 재실행해도 결과가 달라지지 않는지 검증한다.
--
-- 실행:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0014_anonymize_expired_applications.test.sql
-- ============================================================================

begin;

create or replace function pg_temp.assert(p_condition boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'FAIL: %', p_label;
  end if;
  raise notice 'ok - %', p_label;
end;
$$;

-- 테스트 픽스처 -------------------------------------------------------------
insert into public.admin_users (email, role) values ('test-admin@example.com', 'admin');

-- 2년 전에 끝난 회차(보유기간 경과)
insert into public.workshops (
  round, round_label, topic, instructor, location, capacity,
  start_at, end_at, deadline, apply_open_at, level, target
) values (
  91, '테스트91차', '오래된 회차', '테스터', '테스트실', 50,
  now() - interval '2 years', now() - interval '2 years' + interval '2 hours',
  now() - interval '2 years' - interval '2 days', now() - interval '2 years' - interval '30 days',
  '초급', '테스트'
);

-- 최근에 끝난 회차(보유기간 이내)
insert into public.workshops (
  round, round_label, topic, instructor, location, capacity,
  start_at, end_at, deadline, apply_open_at, level, target
) values (
  92, '테스트92차', '최근 회차', '테스터', '테스트실', 50,
  now() - interval '30 days', now() - interval '30 days' + interval '2 hours',
  now() - interval '32 days', now() - interval '60 days',
  '초급', '테스트'
);

-- 신청 건은 관리자 세션으로 넣는다 — 공개 경로는 마감된 회차 INSERT가 막혀 있다(0012).
set local request.jwt.claims = '{"email":"test-admin@example.com"}';
set local role authenticated;

insert into public.applications
  (workshop_id, name, affiliation, id_number, phone, email, consent, status, created_by_admin)
values
  ((select id from public.workshops where round = 91),
   '만료된신청자', '테스트소속', '900201', '010-3333-0001', 'expired@example.com', true, '이수', true),
  ((select id from public.workshops where round = 92),
   '최근신청자', '테스트소속', '900202', '010-3333-0002', 'recent@example.com', true, '이수', true);

reset role;

-- 만료 건에 수료증을 붙여 pdf_path 정리도 확인한다.
insert into public.certificates (application_id, cert_no, pdf_path)
values (
  (select id from public.applications where name = '만료된신청자'),
  '제2024-999호',
  '91/2024-999.pdf'
);

-- ============================================================================
-- 1. 보유기간 경과 건만 익명화된다
-- ============================================================================
select pg_temp.assert(
  public.anonymize_expired_applications() = 1,
  '보유기간(1년)이 지난 신청 건 1건만 익명화된다'
);

select pg_temp.assert(
  (select name from public.applications where id =
    (select a.id from public.applications a
      join public.workshops w on w.id = a.workshop_id where w.round = 91)) = '삭제됨',
  '만료 건의 성명이 제거된다'
);

select pg_temp.assert(
  (select count(*) from public.applications a
     join public.workshops w on w.id = a.workshop_id
    where w.round = 91
      and a.phone = '00000000000'
      and a.email = ''
      and a.id_number = '삭제됨'
      and a.affiliation = '삭제됨') = 1,
  '만료 건의 연락처·이메일·교번·소속이 모두 제거된다'
);

select pg_temp.assert(
  (select name from public.applications where name = '최근신청자') = '최근신청자',
  '보유기간 이내 건은 그대로 유지된다'
);

-- ============================================================================
-- 2. 통계용 값은 보존된다
-- ============================================================================
select pg_temp.assert(
  (select count(*) from public.applications a
     join public.workshops w on w.id = a.workshop_id
    where w.round = 91 and a.status = '이수') = 1,
  '익명화 후에도 회차·상태(이수)는 남아 실적 통계를 낼 수 있다'
);

select pg_temp.assert(
  (select cert_no from public.certificates
    where application_id = (select a.id from public.applications a
      join public.workshops w on w.id = a.workshop_id where w.round = 91)) = '제2024-999호',
  '수료증 발급번호는 보존된다'
);

select pg_temp.assert(
  (select pdf_path from public.certificates
    where application_id = (select a.id from public.applications a
      join public.workshops w on w.id = a.workshop_id where w.round = 91)) is null,
  '성명이 담긴 수료증 PDF 링크(pdf_path)는 끊긴다'
);

-- ============================================================================
-- 3. 재실행 안전성 — 이미 처리한 건은 다시 세지 않는다
-- ============================================================================
select pg_temp.assert(
  public.anonymize_expired_applications() = 0,
  '재실행하면 새로 익명화할 건이 없어 0을 반환한다 (idempotent)'
);

select pg_temp.assert(
  (select anonymized_at from public.applications a
     join public.workshops w on w.id = a.workshop_id where w.round = 91) is not null,
  'anonymized_at이 기록되어 재처리를 건너뛴다'
);

-- ============================================================================
-- 4. 보유기간을 조정하면 대상이 달라진다
-- ============================================================================
select pg_temp.assert(
  public.anonymize_expired_applications(interval '7 days') = 1,
  '보유기간을 7일로 좁히면 최근 회차(30일 전 종료) 건도 대상이 된다'
);

-- ============================================================================
-- 5. 공개 역할은 직접 호출할 수 없다
-- ============================================================================
do $$
begin
  set local role anon;
  begin
    perform public.anonymize_expired_applications();
    reset role;
    raise exception 'FAIL: anon이 익명화 함수를 호출할 수 있다';
  exception
    when insufficient_privilege then
      reset role;
      raise notice 'ok - anon은 익명화 함수를 호출할 수 없다';
  end;
end $$;

select '== 모든 단언 통과 ==' as result;

rollback;
