-- ============================================================================
-- 관리자 INSERT 예외 — 관리자(admin_users)는 신청기간·마감·정원 검증 없이
-- 신청자를 수동/CSV로 등록할 수 있다. 일반(비관리자) 신청은 기존 검증 유지.
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
begin
  perform pg_advisory_xact_lock(hashtext('workshop_capacity_' || new.workshop_id::text));

  select capacity, apply_open_at, deadline into v_capacity, v_open_at, v_deadline
  from public.workshops where id = new.workshop_id;

  if v_capacity is null then
    raise exception '존재하지 않는 워크숍입니다.' using errcode = 'P0001';
  end if;

  -- 관리자 예외: 신청기간(오픈/마감)·정원 검증을 건너뛴다(수동 추가·CSV 일괄 추가용)
  if public.is_admin() then
    return new;
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

-- 트리거(trg_check_application_capacity)는 이미 존재하며 위 함수를 참조하므로 재생성 불요.
