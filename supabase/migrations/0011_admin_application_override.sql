-- ============================================================================
-- 관리자에 의한 교육 참여 등록 — 오픈·마감·정원 검사 예외 처리
-- 관리자 페이지(신청자 관리)의 "참여자 추가" 기능이 현장 등록·추가 인원·소급 등록을
-- 처리할 수 있어야 하므로, is_admin() 세션의 INSERT에는 신청 가능 구간(apply_open_at ~
-- deadline)과 정원 검사를 적용하지 않는다. 비관리자(공개 신청 폼) 경로는 0004와 동일하게 유지.
--
-- 함께 처리: created_by_admin 위조 차단.
--   applications의 INSERT 정책은 `with check (true)`(공개 신청 허용)이라 컬럼 값을 제한하지
--   못한다. 관리자 등록 건은 화면에서 테두리 색·범례로 구분되므로, 비관리자 INSERT는
--   created_by_admin을 항상 false로 덮어써 표기가 오염되지 않게 한다.
--
-- 트리거(trg_check_application_capacity)는 이미 이 함수를 참조하므로 재생성 불필요.
-- ============================================================================
create or replace function public.check_application_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_open_at timestamptz;
  v_deadline timestamptz;
  v_count int;
  v_is_admin boolean;
begin
  perform pg_advisory_xact_lock(hashtext('workshop_capacity_' || new.workshop_id::text));

  select capacity, apply_open_at, deadline into v_capacity, v_open_at, v_deadline
  from public.workshops where id = new.workshop_id;

  -- 존재하지 않는 워크숍은 관리자도 등록할 수 없다.
  if v_capacity is null then
    raise exception '존재하지 않는 워크숍입니다.' using errcode = 'P0001';
  end if;

  v_is_admin := public.is_admin();

  -- 관리자 등록: 오픈·마감·정원 검사를 건너뛴다.
  if v_is_admin then
    return new;
  end if;

  -- 공개 신청 경로: 관리자 등록 표기를 위조할 수 없도록 강제한다.
  new.created_by_admin := false;

  if now() < v_open_at then
    raise exception '아직 신청 기간이 아닙니다.' using errcode = 'P0004';
  end if;

  if now() > v_deadline then
    raise exception '신청 마감된 회차입니다.' using errcode = 'P0002';
  end if;

  select count(*) into v_count
  from public.applications
  where workshop_id = new.workshop_id
    and status in ('신청완료', '이수');

  if v_count >= v_capacity then
    raise exception '정원이 초과된 회차입니다.' using errcode = 'P0003';
  end if;

  return new;
end;
$$;

comment on function public.check_application_capacity() is
  '신청 INSERT 검증. 관리자(is_admin) 등록은 오픈·마감·정원 검사 예외, 비관리자는 created_by_admin=false 강제';
