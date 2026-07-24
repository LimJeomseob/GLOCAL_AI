-- ============================================================================
-- 8월 특강(1~3차) 추가 — 회차 표시 라벨(round_label) 도입 + 신규 3회차 시드
-- 내부 round는 6·7·8로 연번 유지(수료증 번호·/apply?round=N 키), 화면 표기는
-- round_label("7월 1차" ~ "8월 3차")로 분리한다.
-- 신청시작: 8월 회차는 2026-07-27T13:00:00+09:00 (기존 7월 회차는 07-08 09:00 유지)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) round CHECK 제약 완화 — 기존 check (round between 1 and 5) → 1~99
-- ----------------------------------------------------------------------------
alter table public.workshops
  drop constraint if exists workshops_round_check;

alter table public.workshops
  add constraint workshops_round_check check (round between 1 and 99);

-- ----------------------------------------------------------------------------
-- 2) round_label — 화면 표시용 회차 라벨. 기존 1~5차는 "7월 N차"로 백필한다.
-- ----------------------------------------------------------------------------
alter table public.workshops
  add column if not exists round_label text;

update public.workshops
  set round_label = '7월 ' || round::text || '차'
  where round_label is null and round between 1 and 5;

alter table public.workshops
  alter column round_label set not null;

comment on column public.workshops.round_label is
  '화면 표시용 회차 라벨(예: 7월 1차, 8월 3차). 내부 키·수료증 번호는 round 사용';

-- ----------------------------------------------------------------------------
-- 3) 8월 특강 1~3차 시드 (round 6~8) — 0002_seed.sql과 동일 스타일
-- ----------------------------------------------------------------------------
insert into public.workshops
  (round, round_label, topic, instructor, location, capacity, start_at, end_at, deadline, apply_open_at, level, target, sessions, notes)
values
  (
    6,
    '8월 1차',
    '바이브코딩 이해 · AI 활용 업무 자동화',
    '최시경',
    '경상국립대학교 4동 학술정보관 하이플렉스강의실',
    30,
    '2026-08-10T13:00:00+09:00',
    '2026-08-10T17:00:00+09:00',
    '2026-08-08T13:00:00+09:00',
    '2026-07-27T13:00:00+09:00',
    '중급',
    '전체',
    '[
      {"time_label":"13:00~15:00","topic":"바이브코딩 이해","content":"바이브코딩(자연어 기반 코딩) 개념 이해"},
      {"time_label":"15:00~17:00","topic":"AI 활용 업무 자동화","content":"자연어 프롬프트로 업무 자동화 스크립트 작성 실습"}
    ]'::jsonb,
    '개인별 파일 지참(USB) 및 Claude Pro 이상 유료버전 사용 권장'
  ),
  (
    7,
    '8월 2차',
    '제미나이 워크플로우 자동화 · Google Workspace 실습',
    '이성원',
    '경상국립대학교 4동 학술정보관 하이플렉스강의실',
    30,
    '2026-08-13T13:00:00+09:00',
    '2026-08-13T17:00:00+09:00',
    '2026-08-11T13:00:00+09:00',
    '2026-07-27T13:00:00+09:00',
    '초급',
    '전체',
    '[
      {"time_label":"13:00~15:00","topic":"제미나이를 이용한 워크플로우 자동화","content":"Google Gemini 작동 원리 이해 및 프롬프트 기반 반복 업무 자동화(워크플로우) 설계 개념 학습"},
      {"time_label":"15:00~17:00","topic":"Google Workspace 활용 워크플로우(실습)","content":"Google Workspace(문서·시트·메일) 연동을 통한 반복 업무 자동화 흐름 구성 및 실무 적용 실습"}
    ]'::jsonb,
    ''
  ),
  (
    8,
    '8월 3차',
    'Claude 데스크탑 파일 정리 자동화 · 스킬 활용 문서 자동 작성',
    '연정호',
    '경상국립대학교 4동 학술정보관 하이플렉스강의실',
    30,
    '2026-08-14T13:00:00+09:00',
    '2026-08-14T17:00:00+09:00',
    '2026-08-12T13:00:00+09:00',
    '2026-07-27T13:00:00+09:00',
    '중급',
    '전체',
    '[
      {"time_label":"13:00~15:00","topic":"Claude 데스크탑 앱 설치와 파일 정리 자동화","content":"클로드 데스크탑 앱 설치 및 파일·폴더 자동 정리 기능 활용법"},
      {"time_label":"15:00~17:00","topic":"스킬을 활용한 문서 자동 작성","content":"① 이미지 데이터를 엑셀로 자동 분석하는 실습 ② 스킬을 활용해 클로드로 파일을 자동 생성하는 실습"}
    ]'::jsonb,
    '개인별 파일 지참(USB) 및 Claude Pro 이상 유료버전 사용 권장'
  )
on conflict (round) do nothing;
