-- ============================================================================
-- 카카오 알림톡 — 관리자 구성형 템플릿 + 1일 2회 대상자 다이제스트 메일
-- (PRD §9 실구현 1단계: 신청자 직접 발송 대신 관리자에게 대상자 명단 메일)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- kakao_templates — 관리자가 편집하는 알림톡/메일 문구 (요구 1)
-- ----------------------------------------------------------------------------
create table if not exists public.kakao_templates (
  id uuid primary key default gen_random_uuid(),
  template_type text not null unique check (template_type in ('1', '2', '3')),
  name text not null,
  email_subject text not null default '',
  body text not null,
  variables text[] not null default '{}',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger trg_kakao_templates_updated_at
before update on public.kakao_templates
for each row execute function public.set_updated_at();

comment on table public.kakao_templates is '관리자 편집형 알림톡 문구. 다이제스트 메일 본문에 대상자별로 치환되어 포함됨';

-- 초기 문구 seed (기존 KAKAO_TEMPLATES 3종)
insert into public.kakao_templates (template_type, name, email_subject, body, variables) values
  (
    '1',
    '신청결과 안내',
    '[특강] 신청결과 안내 대상자',
    '[{프로그램명}] {성명}님, {회차} 신청이 {상태} 처리되었습니다.' || chr(10) ||
    '일시: {일시}' || chr(10) || '장소: {장소}',
    array['성명','프로그램명','회차','상태','일시','장소']
  ),
  (
    '2',
    '프로그램별 참여 유의사항',
    '[특강] 참여 유의사항 안내 대상자',
    '[{프로그램명}] {성명}님, 참여 전 아래 유의사항을 확인해 주세요.' || chr(10) || '{유의사항}',
    array['성명','프로그램명','유의사항']
  ),
  (
    '3',
    '프로그램 안내',
    '[특강] 프로그램 안내 대상자',
    '[{프로그램명}] {성명}님, 특강 안내드립니다.' || chr(10) ||
    '일시: {일시}' || chr(10) || '장소: {장소}' || chr(10) || '{내용요약}' || chr(10) || '{Zoom링크}',
    array['성명','프로그램명','일시','장소','내용요약','Zoom링크']
  )
on conflict (template_type) do nothing;

alter table public.kakao_templates enable row level security;

create policy "kakao_templates_admin_all" on public.kakao_templates
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- kakao_digest_state — 다이제스트 워터마크(직전 발송 시각) 단일행
-- ----------------------------------------------------------------------------
create table if not exists public.kakao_digest_state (
  id uuid primary key default gen_random_uuid(),
  last_run_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_kakao_digest_state_updated_at
before update on public.kakao_digest_state
for each row execute function public.set_updated_at();

alter table public.kakao_digest_state enable row level security;

create policy "kakao_digest_state_admin_all" on public.kakao_digest_state
  for all using (public.is_admin()) with check (public.is_admin());

-- 최초 1행(현재 시각 기준 — 배포 이후 신규 신청자만 첫 다이제스트에 포함)
insert into public.kakao_digest_state (last_run_at)
select now()
where not exists (select 1 from public.kakao_digest_state);

-- ----------------------------------------------------------------------------
-- kakao_send_settings 확장 — 활성 템플릿/이메일 사용 여부
-- ----------------------------------------------------------------------------
alter table public.kakao_send_settings
  add column if not exists active_template_type text not null default '1'
    check (active_template_type in ('1', '2', '3'));
alter table public.kakao_send_settings
  add column if not exists email_enabled boolean not null default true;
alter table public.kakao_send_settings
  add column if not exists notify_when_empty boolean not null default false;

-- ----------------------------------------------------------------------------
-- kakao_notifications 확장 — 채널/오류메시지 (대상자별 이력)
-- ----------------------------------------------------------------------------
alter table public.kakao_notifications
  add column if not exists channel text not null default 'email';
alter table public.kakao_notifications
  add column if not exists error_message text;

-- ----------------------------------------------------------------------------
-- workshops.zoom_link — 템플릿3 Zoom링크용(온라인 회차)
-- ----------------------------------------------------------------------------
alter table public.workshops
  add column if not exists zoom_link text not null default '';
