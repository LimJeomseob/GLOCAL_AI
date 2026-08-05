-- ============================================================================
-- 공개 Edge Function 호출 빈도 제한 — 성명+연락처 무차별 대입 방어
--
-- 배경: lookup / cancel-application / issue-certificate 는 "성명 + 연락처 일치"만으로
--       본인을 확인한다. 성명은 알아내기 쉬우므로 연락처를 대입해 타인의 신청 내역을
--       조회하거나 **타인의 신청을 취소**하는 것이 이론적으로 가능하다.
--       (취소는 되돌릴 수 없는 파괴적 동작이라 특히 위험하다)
--
-- 방어 구조 2단:
--   1) 대상(성명) 기준 — 같은 사람을 겨냥한 시도 횟수를 제한한다. 공격자는 반드시
--      실존 성명을 겨냥해야 하므로 위조가 불가능한, 정확도 높은 축이다.
--   2) 출처(IP) 기준 — 단순 스크립트 공격을 걸러낸다. 다만 캠퍼스 NAT 뒤에서는 다수
--      이용자가 IP를 공유하므로 한도를 넉넉히 잡는다. x-forwarded-for는 신뢰도가 낮아
--      보조 수단으로만 쓴다.
--
-- 한도가 넉넉해도 방어가 성립하는 이유: 휴대폰 번호 공간은 010-XXXX-XXXX = 10^8 이라
-- 10분당 수십 회로는 탐색이 사실상 불가능하다. 반대로 한도를 너무 조이면 정상 이용자가
-- 막히고, 특정인을 겨냥한 서비스 거부(대상 축 고갈)에도 악용될 수 있으므로 균형을 둔다.
--
-- 개인정보: bucket 키에는 성명·연락처·IP 원문을 저장하지 않는다. Edge Function이
-- SHA-256으로 해시해 넘기므로 이 표에는 식별 불가능한 값만 남는다.
-- ============================================================================

create table public.rate_limit_events (
  id bigserial primary key,
  bucket text not null,
  occurred_at timestamptz not null default now()
);

-- 슬라이딩 윈도우 집계(bucket + 최근 시각)를 위한 인덱스
create index rate_limit_events_bucket_time_idx
  on public.rate_limit_events (bucket, occurred_at desc);

comment on table public.rate_limit_events is
  '공개 Edge Function 호출 빈도 제한용 이벤트 로그. bucket은 SHA-256 해시라 개인정보를 담지 않는다';

-- RLS를 켜되 정책을 두지 않는다 → RLS를 우회하는 service_role(Edge Function)만 접근 가능.
alter table public.rate_limit_events enable row level security;

-- ----------------------------------------------------------------------------
-- rate_limit_hit — 시도를 1건 기록하고 한도 이내인지 돌려준다.
--   반환 true  = 허용(이번 시도가 기록됨)
--   반환 false = 한도 초과(기록하지 않음)
--
-- 초과 시 기록하지 않는 것이 중요하다. 계속 두드릴수록 차단이 연장되는 구조를 피해
-- 윈도우가 지나면 정상 이용자가 정확히 복구되도록 한다.
-- ----------------------------------------------------------------------------
create or replace function public.rate_limit_hit(
  p_bucket text,
  p_limit int,
  p_window interval
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_bucket is null or p_bucket = '' or p_limit is null or p_limit <= 0 then
    raise exception 'rate_limit_hit: 잘못된 인자입니다.' using errcode = '22023';
  end if;

  select count(*) into v_count
  from public.rate_limit_events
  where bucket = p_bucket
    and occurred_at > now() - p_window;

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.rate_limit_events (bucket) values (p_bucket);

  -- 오래된 이벤트 정리. 매 호출마다 지우면 낭비이므로 낮은 확률로만 수행한다.
  -- (pg_cron을 쓸 수 있다면 주기 작업으로 옮기는 편이 더 예측 가능하다)
  if random() < 0.01 then
    delete from public.rate_limit_events where occurred_at < now() - interval '1 hour';
  end if;

  return true;
end;
$$;

-- 공개 역할이 직접 호출해 카운터를 소모시키지 못하도록 실행 권한을 좁힌다.
-- Edge Function은 service_role로 접근하므로 영향이 없다.
revoke execute on function public.rate_limit_hit(text, int, interval) from public;
grant execute on function public.rate_limit_hit(text, int, interval) to service_role;

comment on function public.rate_limit_hit(text, int, interval) is
  '슬라이딩 윈도우 빈도 제한. 허용 시 이벤트를 기록하고 true, 초과 시 기록 없이 false';
