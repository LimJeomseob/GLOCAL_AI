-- ============================================================================
-- 「일과 삶을 바꾸는 생성형 AI 실무과정」 특강 신청·관리 포털 — 초기 스키마
-- PRD §7(데이터 모델), §6.1(관리자 인증/보안), §8(마감·정원 규칙) 참조
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 공통 유틸 함수
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7.1 workshops — 회차 메타
-- ----------------------------------------------------------------------------
create table public.workshops (
  id uuid primary key default gen_random_uuid(),
  round int not null unique check (round between 1 and 5),
  topic text not null,
  instructor text not null,
  location text not null,
  capacity int not null check (capacity > 0),
  start_at timestamptz not null,
  end_at timestamptz not null,
  deadline timestamptz not null,
  level text not null check (level in ('초급', '중급', '고급')),
  target text not null,
  sessions jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.workshops is '회차(1~5차) 메타 정보. deadline = start_at - 2일 (PRD §8)';

-- ----------------------------------------------------------------------------
-- 7.2 applications — 신청서
-- ----------------------------------------------------------------------------
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete restrict,
  name text not null,
  affiliation text not null,
  id_number text not null,
  phone text not null,
  email text not null,
  consent boolean not null check (consent = true),
  status text not null default '신청완료' check (status in ('신청완료', '대기', '취소', '이수')),
  cert_issued boolean not null default false,
  created_by_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create index applications_workshop_id_idx on public.applications (workshop_id);
create index applications_lookup_idx on public.applications (name, phone);

comment on table public.applications is '신청서. 신청내역조회(§5.3)는 name+phone 정확히 일치할 때만 반환';

-- ----------------------------------------------------------------------------
-- 7.3 LAWdata (= survey_responses) — 만족도 응답 (PRD §6.3, §7.3)
-- ----------------------------------------------------------------------------
create table public."LAWdata" (
  id uuid primary key default gen_random_uuid(),
  workshop text not null,
  awareness_path text not null,
  q1 int not null check (q1 between 1 and 5),
  q2 int not null check (q2 between 1 and 5),
  q3 int not null check (q3 between 1 and 5),
  q4 int not null check (q4 between 1 and 5),
  q5 int not null check (q5 between 1 and 5),
  q6 text not null default '',
  submitted_at timestamptz not null default now()
);

comment on table public."LAWdata" is '만족도조사 원천 데이터(PRD §7.3의 survey_responses와 동일 테이블, §6.3 요구사항에 따라 물리명은 LAWdata)';

-- ----------------------------------------------------------------------------
-- 7.4 certificates — 수료증
-- ----------------------------------------------------------------------------
create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  cert_no text not null unique,
  issuer text not null default '경상국립대학교 AI융합원장',
  issued_at timestamptz not null default now(),
  reissue_count int not null default 0,
  pdf_path text,
  updated_at timestamptz not null default now()
);

create trigger trg_certificates_updated_at
before update on public.certificates
for each row execute function public.set_updated_at();

comment on table public.certificates is '수료증 발급 내역. cert_no 형식 예: AI-2026-{회차}-{일련번호} (PRD §6.4)';

-- ----------------------------------------------------------------------------
-- 7.5 admin_users — 관리자 allowlist
-- ----------------------------------------------------------------------------
create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'admin' check (role in ('admin', 'superadmin')),
  created_at timestamptz not null default now()
);

comment on table public.admin_users is '구글 OAuth 이메일 allowlist. 초기 관리자: eros4424@gmail.com';

-- ----------------------------------------------------------------------------
-- 7.6 kakao_notifications — 카카오 알림(설계용)
-- ----------------------------------------------------------------------------
create table public.kakao_notifications (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  recipient text not null,
  template_type text not null check (template_type in ('1', '2', '3')),
  sent_at timestamptz,
  status text not null default '대기' check (status in ('대기', '성공', '실패')),
  response_code text,
  retry_count int not null default 0,
  created_at timestamptz not null default now()
);

create index kakao_notifications_application_id_idx on public.kakao_notifications (application_id);

comment on table public.kakao_notifications is '카카오 알림톡 발송 이력(설계용, §9.6). 실 발송 연동은 후속 범위';

-- 관리자 발송 설정(§9.5 UI 저장용, 싱글턴 1행)
create table public.kakao_send_settings (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null default false,
  template_1_enabled boolean not null default true,
  template_2_enabled boolean not null default true,
  template_3_enabled boolean not null default true,
  schedule_days_before int not null default 2,
  updated_at timestamptz not null default now()
);

create trigger trg_kakao_send_settings_updated_at
before update on public.kakao_send_settings
for each row execute function public.set_updated_at();

comment on table public.kakao_send_settings is '카카오 자동발송 관리자 설정(ON/OFF, 템플릿 활성화, 예약 D-N) — §9.5';

-- ============================================================================
-- 권한 검사 함수 (RLS 정책에서 사용)
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_users au
    where au.email = (auth.jwt() ->> 'email')
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- ============================================================================
-- 정원/마감 검증 트리거 (PRD §8)
-- ============================================================================
create or replace function public.check_application_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_deadline timestamptz;
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtext('workshop_capacity_' || new.workshop_id::text));

  select capacity, deadline into v_capacity, v_deadline
  from public.workshops where id = new.workshop_id;

  if v_capacity is null then
    raise exception '존재하지 않는 워크숍입니다.' using errcode = 'P0001';
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

create trigger trg_check_application_capacity
before insert on public.applications
for each row execute function public.check_application_capacity();

-- ============================================================================
-- 공개 정원현황 조회 함수 — applications 원본은 관리자만 조회 가능하므로
-- 신청 탭(§5.2)의 정원/마감 표기를 위해 회차별 신청건수(집계값)만 노출한다.
-- ============================================================================
create or replace function public.get_workshop_availability()
returns table (workshop_id uuid, applied_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select workshop_id, count(*) as applied_count
  from public.applications
  where status in ('신청완료', '이수')
  group by workshop_id;
$$;

grant execute on function public.get_workshop_availability() to anon, authenticated;

-- ============================================================================
-- 수료증 발급/재발급 함수 (PRD §6.4) — 관리자만 실행 가능
-- ============================================================================
create or replace function public.issue_certificate(p_application_id uuid)
returns public.certificates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.applications%rowtype;
  v_round int;
  v_existing public.certificates%rowtype;
  v_serial int;
  v_cert_no text;
  v_result public.certificates%rowtype;
begin
  if not public.is_admin() then
    raise exception '관리자만 수료증을 발급할 수 있습니다.' using errcode = '42501';
  end if;

  select * into v_app from public.applications where id = p_application_id;
  if v_app.id is null then
    raise exception '신청 건을 찾을 수 없습니다.';
  end if;

  if v_app.status <> '이수' then
    raise exception '이수 상태인 신청 건만 수료증을 발급할 수 있습니다.';
  end if;

  select round into v_round from public.workshops where id = v_app.workshop_id;

  perform pg_advisory_xact_lock(hashtext('cert_serial_' || v_round::text));

  select * into v_existing from public.certificates where application_id = p_application_id;

  if v_existing.id is not null then
    update public.certificates
      set reissue_count = reissue_count + 1
      where id = v_existing.id
      returning * into v_result;
    return v_result;
  end if;

  select count(*) + 1 into v_serial
  from public.certificates c
  join public.applications a on a.id = c.application_id
  join public.workshops w on w.id = a.workshop_id
  where w.round = v_round;

  v_cert_no := 'AI-2026-' || v_round::text || '-' || lpad(v_serial::text, 3, '0');

  insert into public.certificates (application_id, cert_no, issuer, issued_at, reissue_count)
  values (p_application_id, v_cert_no, '경상국립대학교 AI융합원장', now(), 0)
  returning * into v_result;

  update public.applications set cert_issued = true where id = p_application_id;

  return v_result;
end;
$$;

grant execute on function public.issue_certificate(uuid) to authenticated;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.workshops enable row level security;
alter table public.applications enable row level security;
alter table public."LAWdata" enable row level security;
alter table public.certificates enable row level security;
alter table public.admin_users enable row level security;
alter table public.kakao_notifications enable row level security;
alter table public.kakao_send_settings enable row level security;

-- workshops: 신청 포털(소개/신청 탭)에서 공개 조회 필요
create policy "workshops_select_public" on public.workshops
  for select using (true);

-- applications: 공개 신청폼은 INSERT만 허용, 조회/수정/삭제는 관리자만
create policy "applications_insert_public" on public.applications
  for insert with check (true);

create policy "applications_select_admin" on public.applications
  for select using (public.is_admin());

create policy "applications_update_admin" on public.applications
  for update using (public.is_admin()) with check (public.is_admin());

create policy "applications_delete_admin" on public.applications
  for delete using (public.is_admin());

-- LAWdata: 공개 설문 제출은 INSERT만 허용, 조회/삭제는 관리자만
create policy "lawdata_insert_public" on public."LAWdata"
  for insert with check (true);

create policy "lawdata_select_admin" on public."LAWdata"
  for select using (public.is_admin());

create policy "lawdata_delete_admin" on public."LAWdata"
  for delete using (public.is_admin());

-- certificates: 관리자만 접근(신청자 본인 다운로드는 서비스 롤 라우트에서 별도 검증)
create policy "certificates_select_admin" on public.certificates
  for select using (public.is_admin());

create policy "certificates_update_admin" on public.certificates
  for update using (public.is_admin()) with check (public.is_admin());

-- admin_users: 본인 이메일 행만 조회 가능(로그인 후 allowlist 확인 용도), 쓰기는 서비스 롤/SQL로만 관리
create policy "admin_users_select_self" on public.admin_users
  for select using (email = (auth.jwt() ->> 'email'));

-- kakao_notifications / kakao_send_settings: 관리자 전용
create policy "kakao_notifications_admin_all" on public.kakao_notifications
  for all using (public.is_admin()) with check (public.is_admin());

create policy "kakao_send_settings_admin_all" on public.kakao_send_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- Storage: 수료증 PDF 저장 버킷(비공개, 서명 URL로만 접근)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('certificates', 'certificates', false)
on conflict (id) do nothing;

create policy "certificates_storage_admin_all" on storage.objects
  for all using (bucket_id = 'certificates' and public.is_admin())
  with check (bucket_id = 'certificates' and public.is_admin());
