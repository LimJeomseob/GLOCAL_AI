-- 신청자 관리 표의 "안내메세지 확인" 체크 컬럼.
-- 관리자가 신청자에게 안내 메시지를 보냈는지(확인했는지)를 수동으로 기록하며,
-- 표에서 개별 체크 또는 선택 항목 일괄 변경으로 갱신한다.
alter table public.applications
  add column if not exists notice_confirmed boolean not null default false;
