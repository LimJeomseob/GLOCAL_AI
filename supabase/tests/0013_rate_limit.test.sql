-- ============================================================================
-- 0013_rate_limit.sql 회귀 테스트
--
-- 슬라이딩 윈도우 빈도 제한이 (1) 한도까지 허용하고 (2) 초과분을 차단하며
-- (3) 초과 시 이벤트를 기록하지 않아 차단이 무한 연장되지 않고 (4) 윈도우가
-- 지나면 복구되고 (5) bucket끼리 서로 간섭하지 않는지 검증한다.
--
-- 실행:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0013_rate_limit.test.sql
--
-- 트랜잭션 안에서만 실행되고 마지막에 ROLLBACK한다.
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

-- ============================================================================
-- 1. 한도까지는 허용, 초과분은 차단
-- ============================================================================
select pg_temp.assert(
  public.rate_limit_hit('test:a', 3, interval '10 minutes'),
  '1회차 시도는 허용된다'
);
select pg_temp.assert(
  public.rate_limit_hit('test:a', 3, interval '10 minutes'),
  '2회차 시도는 허용된다'
);
select pg_temp.assert(
  public.rate_limit_hit('test:a', 3, interval '10 minutes'),
  '3회차(한도) 시도는 허용된다'
);
select pg_temp.assert(
  public.rate_limit_hit('test:a', 3, interval '10 minutes') = false,
  '한도를 넘은 4회차 시도는 차단된다'
);

-- ============================================================================
-- 2. 차단된 시도는 기록되지 않는다 — 계속 두드려도 차단이 연장되지 않아야 한다
-- ============================================================================
select pg_temp.assert(
  (select count(*) from public.rate_limit_events where bucket = 'test:a') = 3,
  '차단된 시도는 기록되지 않아 이벤트가 한도(3건)를 넘지 않는다'
);

-- 추가로 여러 번 두드려도 마찬가지
select public.rate_limit_hit('test:a', 3, interval '10 minutes');
select public.rate_limit_hit('test:a', 3, interval '10 minutes');
select pg_temp.assert(
  (select count(*) from public.rate_limit_events where bucket = 'test:a') = 3,
  '반복 차단 후에도 기록은 3건으로 유지된다 (차단 무한 연장 방지)'
);

-- ============================================================================
-- 3. bucket 간 독립성 — 한 대상이 막혀도 다른 대상은 영향받지 않는다
-- ============================================================================
select pg_temp.assert(
  public.rate_limit_hit('test:b', 3, interval '10 minutes'),
  '다른 bucket은 독립적으로 허용된다'
);

-- ============================================================================
-- 4. 윈도우 경과 후 복구 — 오래된 이벤트는 집계에서 빠진다
-- ============================================================================
update public.rate_limit_events
  set occurred_at = now() - interval '11 minutes'
  where bucket = 'test:a';

select pg_temp.assert(
  public.rate_limit_hit('test:a', 3, interval '10 minutes'),
  '윈도우(10분)를 벗어난 이벤트는 집계에서 빠져 다시 허용된다'
);

-- ============================================================================
-- 5. 잘못된 인자 방어
-- ============================================================================
do $$
begin
  begin
    perform public.rate_limit_hit('', 3, interval '10 minutes');
    raise exception 'FAIL: 빈 bucket이 허용되었다';
  exception
    when sqlstate '22023' then
      raise notice 'ok - 빈 bucket은 거부된다';
  end;

  begin
    perform public.rate_limit_hit('test:c', 0, interval '10 minutes');
    raise exception 'FAIL: limit=0이 허용되었다';
  exception
    when sqlstate '22023' then
      raise notice 'ok - limit이 0 이하이면 거부된다';
  end;
end $$;

-- ============================================================================
-- 6. 공개 역할은 카운터를 직접 소모시킬 수 없다
--    (Edge Function은 RLS·권한을 우회하는 service_role로 호출하므로 영향 없음)
-- ============================================================================
do $$
begin
  set local role anon;
  begin
    perform public.rate_limit_hit('test:d', 3, interval '10 minutes');
    reset role;
    raise exception 'FAIL: anon이 rate_limit_hit을 직접 호출할 수 있다';
  exception
    when insufficient_privilege then
      reset role;
      raise notice 'ok - anon은 rate_limit_hit을 호출할 수 없다';
  end;
end $$;

do $$
declare
  v_count int;
begin
  set local role anon;
  begin
    select count(*) into v_count from public.rate_limit_events;
    -- RLS가 켜져 있고 정책이 없으므로 0행만 보여야 한다(권한 오류가 나도 정상).
    reset role;
    perform pg_temp.assert(v_count = 0, 'anon에게는 빈도 제한 이벤트가 보이지 않는다 (RLS)');
  exception
    when insufficient_privilege then
      reset role;
      raise notice 'ok - anon은 rate_limit_events를 조회할 수 없다';
  end;
end $$;

select '== 모든 단언 통과 ==' as result;

rollback;
