-- ============================================================================
-- 개인정보 보유기간 경과 건 자동 파기(익명화)
--
-- 신청 폼에 고지한 보유 기간은 "특강 종료 후 1년 또는 관계 법령에 따름"인데
-- (ApplicationForm.tsx의 개인정보 수집·이용 동의), 실제 파기 수단이 없어 고지와 운영이
-- 어긋나 있었다. 종료 후 1년이 지난 회차의 신청 건에서 개인 식별자를 제거한다.
--
-- 삭제가 아니라 익명화인 이유: 회차별 신청/이수 인원 같은 사업 실적 통계와 수료증 발급
-- 이력(발급번호)은 남겨야 하기 때문이다. 식별자만 지우면 통계는 보존되고 개인은 특정할 수 없다.
--
-- 남는 값: workshop_id, status, cert_issued, created_at (통계용)
-- 지우는 값: name, affiliation, id_number, phone, email
--
-- ⚠ Storage에 저장된 수료증 PDF에는 성명이 그대로 남는다. SQL로는 Storage 실체 파일을
--   지울 수 없어(storage.objects는 메타데이터일 뿐, 삭제 시 고아 파일이 남는다) 여기서는
--   pdf_path만 끊는다. 실제 파일 삭제는 Storage API를 쓰는 별도 작업이 필요하다.
--   docs/SYSTEM_IMPROVEMENT_REVIEW.md에 남은 과제로 적어 두었다.
-- ============================================================================

-- 재실행해도 안전하도록 익명화 시각을 기록한다(이미 처리한 행은 건너뛴다).
alter table public.applications
  add column if not exists anonymized_at timestamptz;

comment on column public.applications.anonymized_at is
  '개인정보 보유기간 경과로 식별자를 제거한 시각. null이면 미처리';

-- ----------------------------------------------------------------------------
-- anonymize_expired_applications — 보유기간이 지난 신청 건의 식별자를 제거한다.
--   p_retention: 특강 종료 시점(workshops.end_at)으로부터의 보유 기간
--   반환값: 이번 실행에서 익명화한 행 수
--
-- 익명화 값은 0012의 길이 제약(applications_text_length_chk)을 만족해야 하므로
-- 빈 문자열 대신 고정 문자열을 넣는다(email만 빈 문자열 허용).
-- ----------------------------------------------------------------------------
create or replace function public.anonymize_expired_applications(
  p_retention interval default interval '1 year'
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with expired as (
    select a.id
    from public.applications a
    join public.workshops w on w.id = a.workshop_id
    where a.anonymized_at is null
      and w.end_at < now() - p_retention
  ),
  updated as (
    update public.applications a
      set name = '삭제됨',
          affiliation = '삭제됨',
          id_number = '삭제됨',
          phone = '00000000000',
          email = '',
          anonymized_at = now()
      from expired e
      where a.id = e.id
      returning a.id
  )
  select count(*) into v_count from updated;

  -- 수료증 PDF는 성명이 담긴 파일이므로 링크를 끊는다.
  -- (실체 파일 삭제는 Storage API가 필요해 이 함수 범위 밖이다)
  update public.certificates c
    set pdf_path = null
    from public.applications a
    where a.id = c.application_id
      and a.anonymized_at is not null
      and c.pdf_path is not null;

  return v_count;
end;
$$;

comment on function public.anonymize_expired_applications(interval) is
  '보유기간(기본 1년) 경과 신청 건의 개인 식별자를 제거하고 처리 건수를 반환. 재실행 안전';

-- 공개 역할이 임의로 호출하지 못하게 실행 권한을 좁힌다.
revoke execute on function public.anonymize_expired_applications(interval) from public;
grant execute on function public.anonymize_expired_applications(interval) to service_role;

-- ----------------------------------------------------------------------------
-- 정기 실행 등록 — pg_cron이 있을 때만.
-- Supabase에서 pg_cron은 대시보드(Database → Extensions)에서 켜야 하므로, 꺼져 있으면
-- 마이그레이션을 실패시키지 않고 안내만 남긴다. 나중에 켠 뒤 아래 SQL을 직접 실행하면 된다:
--
--   select cron.schedule('anonymize-expired-applications', '0 18 * * *',
--                        'select public.anonymize_expired_applications()');
--
-- (0 18 * * * UTC = 한국시간 매일 새벽 3시)
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 같은 이름의 작업이 있으면 먼저 제거해 재실행에도 안전하게 만든다.
    if exists (select 1 from cron.job where jobname = 'anonymize-expired-applications') then
      perform cron.unschedule('anonymize-expired-applications');
    end if;

    perform cron.schedule(
      'anonymize-expired-applications',
      '0 18 * * *',
      'select public.anonymize_expired_applications()'
    );
    raise notice 'pg_cron 작업을 등록했습니다: anonymize-expired-applications (매일 UTC 18:00 = KST 03:00)';
  else
    raise notice 'pg_cron이 설치되어 있지 않아 자동 실행을 등록하지 못했습니다. 확장을 켠 뒤 cron.schedule을 직접 실행하세요(0014 마이그레이션 주석 참조).';
  end if;
end $$;
