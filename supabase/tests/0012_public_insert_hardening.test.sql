-- ============================================================================
-- 0012_public_insert_hardening.sql 회귀 테스트
--
-- 공개(anon) INSERT 경로가 status/cert_issued/created_by_admin를 위조할 수 없고,
-- 오픈·마감·중복·정원 검사를 우회할 수 없음을 검증한다.
-- 관리자(is_admin) 경로는 기존 예외(현장 등록·대리 신청)가 유지되는지 함께 확인한다.
--
-- 실행 (로컬 Supabase 또는 임의의 Postgres):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0012_public_insert_hardening.test.sql
--
-- 전체가 하나의 트랜잭션이며 마지막에 ROLLBACK하므로 DB에 아무 것도 남기지 않는다.
-- 실패한 단언은 예외를 던지고, 그 즉시 스크립트가 중단된다(ON_ERROR_STOP=1).
-- ============================================================================

begin;

-- pgTAP 없이도 돌도록 최소한의 단언 헬퍼를 트랜잭션 안에만 만든다.
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

-- 지금 신청 가능한(오픈됨·미마감) 정원 2명짜리 회차
insert into public.workshops (
  round, round_label, topic, instructor, location, capacity,
  start_at, end_at, deadline, apply_open_at, level, target
) values (
  99, '테스트99차', '테스트 회차', '테스터', '테스트실', 2,
  now() + interval '10 days', now() + interval '10 days 2 hours',
  now() + interval '8 days', now() - interval '1 day', '초급', '테스트'
);

-- 이미 마감된 회차(관리자 예외 검증용)
insert into public.workshops (
  round, round_label, topic, instructor, location, capacity,
  start_at, end_at, deadline, apply_open_at, level, target
) values (
  98, '테스트98차', '마감된 테스트 회차', '테스터', '테스트실', 1,
  now() + interval '1 day', now() + interval '1 day 2 hours',
  now() - interval '1 hour', now() - interval '10 days', '초급', '테스트'
);

-- 정원에 여유가 있는 회차(길이 제한 검증용 — 정원 오류가 먼저 발생하면 안 되므로 분리한다)
insert into public.workshops (
  round, round_label, topic, instructor, location, capacity,
  start_at, end_at, deadline, apply_open_at, level, target
) values (
  97, '테스트97차', '여유 있는 테스트 회차', '테스터', '테스트실', 10,
  now() + interval '10 days', now() + interval '10 days 2 hours',
  now() + interval '8 days', now() - interval '1 day', '초급', '테스트'
);

-- anon/authenticated의 테이블 권한은 _shim.sql이 Supabase와 동일하게 미리 부여한다.

-- ============================================================================
-- 1. 공개 경로: status / cert_issued / created_by_admin 위조 차단
-- ============================================================================
set local role anon;

insert into public.applications
  (workshop_id, name, affiliation, id_number, phone, email, consent,
   status, cert_issued, created_by_admin)
values
  ((select id from public.workshops where round = 99),
   '위조시도', '테스트소속', '900101', '010-1111-0001', 'forge@example.com', true,
   '이수', true, true);

reset role;

select pg_temp.assert(
  (select status from public.applications where phone = '010-1111-0001') = '신청완료',
  '공개 INSERT의 status=이수 위조가 신청완료로 강제된다 (수료증 부정 발급 차단)'
);
select pg_temp.assert(
  (select cert_issued from public.applications where phone = '010-1111-0001') = false,
  '공개 INSERT의 cert_issued=true 위조가 false로 강제된다'
);
select pg_temp.assert(
  (select created_by_admin from public.applications where phone = '010-1111-0001') = false,
  '공개 INSERT의 created_by_admin=true 위조가 false로 강제된다 (0011 회귀 방지)'
);

-- ============================================================================
-- 2. 공개 경로: 중복 신청 차단 (하이픈 유무가 달라도 동일 번호로 인식)
-- ============================================================================
do $$
declare
  v_sqlstate text;
begin
  set local role anon;
  begin
    insert into public.applications
      (workshop_id, name, affiliation, id_number, phone, email, consent)
    values
      ((select id from public.workshops where round = 99),
       '중복시도', '테스트소속', '900102', '01011110001', 'dup@example.com', true);
    reset role;
    raise exception 'FAIL: 동일 연락처 중복 신청이 차단되지 않았다';
  exception
    when sqlstate 'P0005' then
      reset role;
      raise notice 'ok - 하이픈 없는 동일 연락처의 중복 신청이 P0005로 차단된다 (좌석 고갈 방어)';
  end;
end $$;

-- 취소 건은 중복 집계에서 제외되므로 재신청은 허용되어야 한다.
update public.applications set status = '취소' where phone = '010-1111-0001';

set local role anon;
insert into public.applications
  (workshop_id, name, affiliation, id_number, phone, email, consent)
values
  ((select id from public.workshops where round = 99),
   '재신청', '테스트소속', '900103', '010-1111-0001', 'again@example.com', true);
reset role;

select pg_temp.assert(
  (select count(*) from public.applications
    where phone = '010-1111-0001' and status = '신청완료') = 1,
  '취소 후 동일 연락처 재신청은 허용된다'
);

-- ============================================================================
-- 3. 공개 경로: 정원 초과 차단 — status='대기'로 우회할 수 없다
--    (수정 전에는 대기/취소 상태로 INSERT하면 정원 집계를 피해 무제한 삽입이 가능했다)
-- ============================================================================
set local role anon;
insert into public.applications
  (workshop_id, name, affiliation, id_number, phone, email, consent)
values
  ((select id from public.workshops where round = 99),
   '정원채우기', '테스트소속', '900104', '010-1111-0002', 'fill@example.com', true);
reset role;

do $$
begin
  set local role anon;
  begin
    insert into public.applications
      (workshop_id, name, affiliation, id_number, phone, email, consent, status)
    values
      ((select id from public.workshops where round = 99),
       '정원우회시도', '테스트소속', '900105', '010-1111-0003', 'over@example.com', true, '대기');
    reset role;
    raise exception 'FAIL: status=대기 위조로 정원 검사가 우회되었다';
  exception
    when sqlstate 'P0003' then
      reset role;
      raise notice 'ok - status=대기 위조로도 정원 검사를 우회할 수 없다 (P0003)';
  end;
end $$;

-- ============================================================================
-- 4. 공개 경로: 마감된 회차 신청 차단
-- ============================================================================
do $$
begin
  set local role anon;
  begin
    insert into public.applications
      (workshop_id, name, affiliation, id_number, phone, email, consent)
    values
      ((select id from public.workshops where round = 98),
       '마감후시도', '테스트소속', '900106', '010-1111-0004', 'late@example.com', true);
    reset role;
    raise exception 'FAIL: 마감된 회차 신청이 차단되지 않았다';
  exception
    when sqlstate 'P0002' then
      reset role;
      raise notice 'ok - 마감된 회차의 공개 신청은 P0002로 차단된다';
  end;
end $$;

-- ============================================================================
-- 5. 공개 경로: 길이 제한
-- ============================================================================
do $$
begin
  set local role anon;
  begin
    insert into public.applications
      (workshop_id, name, affiliation, id_number, phone, email, consent)
    values
      ((select id from public.workshops where round = 97),
       repeat('가', 51), '테스트소속', '900107', '010-1111-0005', 'long@example.com', true);
    reset role;
    raise exception 'FAIL: 과도한 길이의 성명이 저장되었다';
  exception
    when check_violation then
      reset role;
      raise notice 'ok - 길이 제한(applications_text_length_chk)이 강제된다';
  end;
end $$;

-- ============================================================================
-- 6. 관리자 경로: 마감·정원·중복 예외가 유지된다
-- ============================================================================
set local request.jwt.claims = '{"email":"test-admin@example.com"}';
set local role authenticated;

select pg_temp.assert(public.is_admin(), '관리자 세션에서 is_admin()이 true다');

-- 마감된 회차 + 이미 정원(1명)을 채운 상태에서도 관리자는 등록할 수 있어야 한다.
insert into public.applications
  (workshop_id, name, affiliation, id_number, phone, email, consent, status, created_by_admin)
values
  ((select id from public.workshops where round = 98),
   '관리자등록1', '테스트소속', '900108', '010-2222-0001', 'admin1@example.com', true, '이수', true),
  ((select id from public.workshops where round = 98),
   '관리자등록2', '테스트소속', '900109', '010-2222-0002', 'admin2@example.com', true, '신청완료', true);

-- 대리 신청·재등록을 위해 관리자는 동일 연락처 중복 등록도 가능해야 한다(ApplicantsTable 동작 보존).
insert into public.applications
  (workshop_id, name, affiliation, id_number, phone, email, consent, status, created_by_admin)
values
  ((select id from public.workshops where round = 98),
   '관리자중복등록', '테스트소속', '900110', '010-2222-0001', 'admin3@example.com', true, '신청완료', true);

reset role;

select pg_temp.assert(
  (select count(*) from public.applications where created_by_admin = true) = 3,
  '관리자는 마감·정원·중복과 무관하게 등록할 수 있다 (0011 예외 유지)'
);
select pg_temp.assert(
  (select status from public.applications where phone = '010-2222-0001' and name = '관리자등록1') = '이수',
  '관리자가 지정한 status는 덮어쓰이지 않는다'
);

-- ============================================================================
-- 7. 설문(LAWdata) 길이 제한
-- ============================================================================
do $$
begin
  set local role anon;
  begin
    insert into public."LAWdata" (workshop, awareness_path, q1, q2, q3, q4, q5, q6)
    values ('테스트', '홈페이지', 5, 5, 5, 5, 5, repeat('가', 2001));
    reset role;
    raise exception 'FAIL: 과도한 길이의 설문 주관식이 저장되었다';
  exception
    when check_violation then
      reset role;
      raise notice 'ok - 설문 길이 제한(lawdata_text_length_chk)이 강제된다';
  end;
end $$;

select '== 모든 단언 통과 ==' as result;

rollback;
