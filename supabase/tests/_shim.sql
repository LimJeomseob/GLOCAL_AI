-- ============================================================================
-- Supabase 환경 shim — 순수 Postgres에서 마이그레이션·테스트를 돌리기 위한 최소 구성
--
-- 실제 Supabase 프로젝트에는 아래 역할·스키마·함수가 이미 존재하므로 이 파일을 적용하면
-- 안 된다. CI(postgres 서비스 컨테이너)나 로컬 psql 검증에서만 사용한다.
--
-- 마이그레이션이 참조하는 Supabase 제공 객체는 다음 뿐이다:
--   - 역할: anon / authenticated / service_role
--   - auth.jwt()  : is_admin()이 관리자 이메일을 읽는 경로
--   - storage.buckets / storage.objects : 수료증 PDF 버킷과 정책 대상
-- ============================================================================
-- 역할은 DB가 아니라 클러스터 단위로 존재하므로, 같은 클러스터에서 여러 번 돌려도
-- 깨지지 않도록 존재 여부를 확인하고 만든다.
do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = v_role) then
      execute format('create role %I nologin', v_role);
    end if;
  end loop;
end $$;

create schema if not exists auth;
create schema if not exists storage;

create extension if not exists pgcrypto;

-- Supabase와 동일하게 request.jwt.claims GUC에서 클레임을 읽는다.
-- 테스트에서는 `set local request.jwt.claims = '{"email":"..."}'` 로 세션을 흉내 낸다.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text
);

-- Supabase는 public 스키마의 테이블 권한을 anon/authenticated에 넓게 부여하고 접근 통제는
-- 전적으로 RLS에 맡긴다. 같은 조건을 만들어야 RLS 정책을 실제와 동일하게 검증할 수 있다.
-- 이 shim은 마이그레이션보다 먼저 실행되므로, 앞으로 만들어질 테이블에 적용되도록
-- 기본 권한(default privileges)으로 건다.
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

-- 이미 만들어진 테이블이 있다면 함께 부여한다(shim을 마이그레이션 뒤에 돌리는 경우 대비).
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
