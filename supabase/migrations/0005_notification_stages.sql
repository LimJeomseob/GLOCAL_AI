-- ============================================================================
-- 신청자별 카톡 안내 발송 단계 체크 (관리자 수동 체크용)
-- 1차 신청결과 안내 / 2차 수강안내 / 3차 최종수강안내
-- ============================================================================
alter table public.applications
  add column if not exists kakao_notice1_sent boolean not null default false,
  add column if not exists kakao_notice2_sent boolean not null default false,
  add column if not exists kakao_notice3_sent boolean not null default false;

comment on column public.applications.kakao_notice1_sent is '1차 신청결과 안내 발송 여부(관리자 체크)';
comment on column public.applications.kakao_notice2_sent is '2차 수강안내 발송 여부(관리자 체크)';
comment on column public.applications.kakao_notice3_sent is '3차 최종수강안내 발송 여부(관리자 체크)';

-- RLS: 기존 applications_update_admin / applications_delete_admin 정책이
-- 행 단위로 적용되므로 추가 정책 불필요 (0001_init.sql 참조).
