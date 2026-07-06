-- ============================================================================
-- 신청기간(오픈) 강제 — 신청 시작일 이전에는 신청 불가하도록 검증 추가
-- PRD §1.3(신청기간: 2026-07-01 ~ 각 회차 시작 2일 전), §8(마감·정원 규칙) 참조
-- 기존 스키마는 마감(deadline)·정원만 검증했으므로, 오픈(apply_open_at) 검증을 추가한다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- workshops.apply_open_at — 신청 시작(오픈) 일시
-- default = 프론트 상수 APPLICATION_OPEN_AT("2026-07-08T09:00:00+09:00")와 동일.
-- default가 있으므로 기존 행은 자동 백필되고 신규 seed INSERT도 정상 동작한다.
-- ----------------------------------------------------------------------------
alter table public.workshops
  add column if not exists apply_open_at timestamptz not null
  default '2026-07-08T09:00:00+09:00';

comment on column public.workshops.apply_open_at is '신청 시작(오픈) 일시. 신청 가능 구간 = apply_open_at ~ deadline (PRD §1.3, §8)';

-- ----------------------------------------------------------------------------
-- 정원/마감 + 오픈 검증 트리거 재정의 (PRD §8) — 오픈 검사(P0004)를 마감 검사 앞에 추가
-- ----------------------------------------------------------------------------
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
begin
  perform pg_advisory_xact_lock(hashtext('workshop_capacity_' || new.workshop_id::text));

  select capacity, apply_open_at, deadline into v_capacity, v_open_at, v_deadline
  from public.workshops where id = new.workshop_id;

  if v_capacity is null then
    raise exception '존재하지 않는 워크숍입니다.' using errcode = 'P0001';
  end if;

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

-- 트리거(trg_check_application_capacity)는 이미 존재하며 위 함수를 참조하므로 재생성 불필요.
