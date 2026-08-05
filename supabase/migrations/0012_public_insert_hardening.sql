-- ============================================================================
-- 공개 INSERT 경로 강화 — 컬럼 위조 차단 · 중복 신청 차단 · 길이 제한
--
-- 배경: applications / "LAWdata" 의 INSERT 정책은 공개 신청·설문 제출을 허용하기 위해
--       `with check (true)` 이므로 **컬럼 값을 전혀 제한하지 못한다**. 정적 사이트라
--       anon key가 공개되어 있어, 신청 폼을 거치지 않고 PostgREST를 직접 호출하는 것이
--       언제나 가능하다는 전제에서 서버 측 강제가 필요하다.
--
-- 이 마이그레이션이 막는 것:
--   (1) status/cert_issued 위조 — status='이수'로 직접 INSERT 후 공개 수료증 발급
--       Edge Function(issue-certificate)을 호출하면 수강 없이 정식 발급번호가 채번된다.
--   (2) 정원·마감 검사 우회 — 정원 집계는 status in ('신청완료','이수') 기준이므로
--       status='대기'/'취소'로 INSERT하면 오픈 전·마감 후·정원 초과와 무관하게 무제한
--       행 삽입이 가능했다. (1)의 status 강제로 함께 해소된다.
--   (3) 좌석 고갈(DoS) — 동일 연락처로 같은 회차를 반복 신청해 정원을 선점하는 공격.
--   (4) 저장소 남용 — 길이 제한이 없어 임의 크기 문자열을 넣을 수 있었다.
--
-- 관리자(is_admin) 경로는 0011과 동일하게 예외를 유지한다. 특히 중복 등록은 대리 신청·
-- 재등록을 위해 관리자 화면에서 확인 후 허용하는 기존 동작(ApplicantsTable)을 보존한다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 신청 INSERT 검증 트리거 재정의
--    함수 선두의 advisory lock은 해당 회차의 모든 INSERT를 직렬화하므로,
--    중복 검사(SELECT)와 정원 검사 모두 경쟁 조건 없이 안전하다.
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
  v_is_admin boolean;
  v_duplicate_exists boolean;
begin
  perform pg_advisory_xact_lock(hashtext('workshop_capacity_' || new.workshop_id::text));

  select capacity, apply_open_at, deadline into v_capacity, v_open_at, v_deadline
  from public.workshops where id = new.workshop_id;

  -- 존재하지 않는 워크숍은 관리자도 등록할 수 없다.
  if v_capacity is null then
    raise exception '존재하지 않는 워크숍입니다.' using errcode = 'P0001';
  end if;

  v_is_admin := public.is_admin();

  -- 관리자 등록: 오픈·마감·정원·중복 검사를 건너뛴다(현장 등록·추가 인원·소급 등록·대리 신청).
  if v_is_admin then
    return new;
  end if;

  -- ── 이하 공개 신청 경로 ──────────────────────────────────────────────────
  -- 클라이언트가 보낸 값을 신뢰하지 않고 서버에서 덮어쓴다.
  -- 공개 신청은 언제나 '신청완료'로만 생성되며, 대기/취소/이수 전환과 수료증 발급은
  -- 각각 관리자 포털과 issue_certificate()의 책임이다.
  new.status := '신청완료';
  new.cert_issued := false;
  new.created_by_admin := false;

  if now() < v_open_at then
    raise exception '아직 신청 기간이 아닙니다.' using errcode = 'P0004';
  end if;

  if now() > v_deadline then
    raise exception '신청 마감된 회차입니다.' using errcode = 'P0002';
  end if;

  -- 중복 신청 차단. 저장된 연락처는 하이픈 유무가 섞일 수 있으므로 숫자만 남겨 비교한다.
  -- 취소 건은 제외 — 취소 후 재신청은 허용한다.
  select exists (
    select 1
    from public.applications a
    where a.workshop_id = new.workshop_id
      and a.status in ('신청완료', '대기', '이수')
      and regexp_replace(a.phone, '[^0-9]', '', 'g')
          = regexp_replace(new.phone, '[^0-9]', '', 'g')
  ) into v_duplicate_exists;

  if v_duplicate_exists then
    raise exception '이미 해당 회차에 신청된 연락처입니다.' using errcode = 'P0005';
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
  '신청 INSERT 검증. 관리자(is_admin)는 오픈·마감·정원·중복 검사 예외. '
  '비관리자는 status=신청완료 / cert_issued=false / created_by_admin=false 강제 후 '
  '오픈(P0004)·마감(P0002)·중복(P0005)·정원(P0003) 순으로 검사';

-- ----------------------------------------------------------------------------
-- 2. 입력 길이 제한
--    운영 중인 DB의 기존 행 때문에 마이그레이션이 실패하지 않도록 `not valid`로 추가한다.
--    `not valid`는 기존 행 검증만 건너뛸 뿐, 이후의 INSERT/UPDATE에는 그대로 강제된다.
--    (기존 행은 모두 클라이언트 검증을 거쳤으므로 실제 위반 가능성은 낮다)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'applications_text_length_chk'
  ) then
    alter table public.applications
      add constraint applications_text_length_chk check (
        char_length(name) between 1 and 50
        and char_length(affiliation) between 1 and 100
        and char_length(id_number) between 1 and 50
        and char_length(phone) between 1 and 20
        and char_length(email) <= 254
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'lawdata_text_length_chk'
  ) then
    alter table public."LAWdata"
      add constraint lawdata_text_length_chk check (
        char_length(workshop) between 1 and 200
        and char_length(awareness_path) between 1 and 100
        and char_length(q6) <= 2000
      ) not valid;
  end if;
end $$;
