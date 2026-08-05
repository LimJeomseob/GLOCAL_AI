# 글로컬 AI 동행 포털

경상국립대학교 글로컬대학30 사업 「일과 삶을 바꾸는 생성형 AI 실무과정」 특강 신청·관리 포털 (`PRD.md` 참조).

이 저장소는 **완전 정적 사이트(Next.js `output: 'export'`)** 로 빌드되어 **GitHub Pages** 에 배포됩니다.
서버가 필요한 로직(신청내역조회, 수료증 PDF 발급)은 **Supabase Edge Function** 으로 분리되어 있습니다.

## 아키텍처 요약

- 프론트엔드: Next.js(App Router, 정적 export) + Tailwind CSS → GitHub Pages
- 데이터/인증: Supabase(Postgres, Auth, RLS, Storage) — 브라우저에서 anon key로 직접 접근, 접근 통제는 전부 RLS
- 서비스 롤 키로 RLS를 우회해야 하는 공개 작업(성명+연락처 본인확인 기반)만 Supabase Edge Function으로 처리
  - `supabase/functions/lookup` — 성명+연락처가 정확히 일치하는 신청 건만 서버에서 필터링해 반환(§5.3)
  - `supabase/functions/cancel-application` — 본인확인 후 신청 상태를 '취소'로 변경(특강 시작 전·신청완료/대기 건만).
    행 삭제는 여전히 관리자 포털에서만 가능
  - `supabase/functions/issue-certificate` — 본인확인 후 이수 건 수료증 발급(발급번호 채번·서식 전달)
- 수료증 PDF 발급/재발급(§6.4)은 Edge Function이 아니라 **관리자의 브라우저**에서 직접 생성합니다
  (`src/lib/certificatePdf.ts`, `src/lib/issueCertificate.ts`). `issue_certificate()` RPC 호출과
  Storage 업로드 모두 RLS의 `is_admin()` 체크로 통제되므로 관리자가 아니면 실행되지 않습니다.
  Deno(Supabase Edge Function) 환경에서는 `@pdf-lib/fontkit`이 내부적으로
  `Object.prototype.__proto__` 조작에 의존하는 부분이 있어 Deno의 보안 기본값과 충돌해
  런타임에 실패하는 것을 배포 전 스모크 테스트로 확인했습니다 — 그래서 브라우저 실행으로 우회했습니다.
- 관리자 인증: Supabase Auth 구글 OAuth + `admin_users` allowlist. 서버 미들웨어가 없으므로
  접근 통제는 클라이언트 라우트 가드(`useAdminSession`) + Supabase RLS(`is_admin()`)의 이중 구조입니다.

### 공개 INSERT 경로의 보안 전제

anon key가 정적 사이트에 공개되어 있으므로 **신청 폼을 거치지 않은 PostgREST 직접 호출은
언제나 가능하다**고 전제해야 합니다. `applications`/`LAWdata`의 INSERT 정책은 공개 신청·설문
제출을 허용하기 위해 `with check (true)`라서 컬럼 값을 제한하지 못하므로, 값 강제는 전부
`check_application_capacity()` 트리거(`0012_public_insert_hardening.sql`)가 담당합니다.

- 비관리자 INSERT는 `status='신청완료'`, `cert_issued=false`, `created_by_admin=false`로 **강제**됩니다.
  (강제 전에는 `status='이수'`로 직접 INSERT한 뒤 공개 수료증 발급 함수를 호출해 수강 없이
  정식 발급번호를 받을 수 있었고, `status='대기'`로 넣으면 정원·마감 검사도 우회됐습니다)
- 같은 회차에 동일 연락처(하이픈 무시)로 활성 신청이 있으면 `P0005`로 거부합니다 — 정원 선점 방어.
  취소 건은 제외되므로 취소 후 재신청은 가능합니다.
- 관리자(`is_admin()`) 경로는 현장 등록·소급 등록·대리 신청을 위해 오픈·마감·정원·중복 검사에서
  제외됩니다.
- 트리거가 raise하는 코드(`P0001`~`P0005`)는 `src/lib/dbErrors.ts`에서 사용자 문구로 매핑합니다.
  매핑되지 않은 오류는 원문 대신 일반 문구로 대체해 내부 정보 노출을 막습니다.

### 공개 Edge Function의 빈도 제한

`lookup` / `cancel-application` / `issue-certificate`는 **성명+연락처 일치만으로** 본인을
확인합니다. 성명은 알아내기 쉬우므로 연락처를 대입해 타인의 신청을 조회하거나
**취소**(되돌릴 수 없음)하는 시도를 막기 위해 `0013_rate_limit.sql`의 빈도 제한을 겁니다.

- **대상(성명) 기준 10분당 15회** — 공격자는 실존 성명을 겨냥해야 하므로 위조가 불가능한 축입니다.
- **출처(IP) 기준 10분당 60회** — 캠퍼스 NAT 뒤 다수 이용자를 고려해 넉넉히 잡았습니다.
  `x-forwarded-for`는 위조 여지가 있어 보조 수단으로만 씁니다.
- 한도가 넉넉해도 방어가 성립합니다. 휴대폰 번호 공간이 `010-XXXX-XXXX` = 10^8 이라
  10분당 수십 회로는 탐색이 불가능합니다. 반대로 너무 조이면 정상 이용자가 막히고
  특정인을 겨냥한 서비스 거부에 악용될 수 있어 균형을 둡니다.
- 한도 초과 시 `429`와 `Retry-After: 600`을 돌려주며, 초과한 시도는 **기록하지 않아**
  계속 두드려도 차단이 연장되지 않습니다(윈도우가 지나면 정확히 복구).
- 빈도 제한 저장소 오류 시에는 **열어 둡니다**(fail-open). 여기서 막으면 저장소 장애가
  곧 전면 서비스 중단이 되기 때문이며, 대신 오류를 로그로 남깁니다.
- `rate_limit_events`의 `bucket`은 SHA-256 해시라 성명·연락처·IP 원문이 저장되지 않습니다.

> 봇 방어(Turnstile)와 추가 본인확인 요소는 아직 적용하지 않았습니다 —
> `docs/SYSTEM_IMPROVEMENT_REVIEW.md` 참조.

## 최초 배포 절차

### 1. Supabase 프로젝트 준비
1. [supabase.com](https://supabase.com) 에서 프로젝트 생성
2. `supabase/migrations/0001_init.sql`, `supabase/migrations/0002_seed.sql` 을 순서대로 적용
   (Supabase CLI: `supabase link --project-ref <ref>` 후 `supabase db push`, 또는 대시보드 SQL Editor에서 순서대로 실행)
3. Authentication → Sign In / Providers → **Google** 활성화
   - Google Cloud Console에서 OAuth 클라이언트 생성, **Authorized redirect URI**는 Supabase가 제공하는
     `https://<project-ref>.supabase.co/auth/v1/callback` 로 등록
   - 발급받은 Client ID/Secret을 Supabase Google Provider 설정에 입력
4. Authentication → URL Configuration (**로그인 후 localhost로 튕기는 오류를 막으려면 반드시 설정**):
   - **Site URL**: 기본값이 `http://localhost:3000` 이므로 배포 주소로 바꿉니다.
     예: `https://<github-username>.github.io/GLOCAL_AI`
     (이 값이 localhost로 남아 있으면, 구글 로그인 후 `ERR_CONNECTION_REFUSED`(localhost 연결 거부)로 실패합니다)
   - **Redirect URLs**: 배포될 GitHub Pages 주소를 와일드카드로 추가합니다.
     예: `https://<github-username>.github.io/GLOCAL_AI/**`
     (`**` 는 하위 경로와 `?redirectedFrom=...` 쿼리스트링까지 매칭)
5. Table Editor에서 `admin_users` 테이블에 관리자로 추가할 이메일이 들어있는지 확인
   (시드에 `eros4424@gmail.com` 포함됨. 추가 관리자는 이 테이블에 행을 더 넣으면 됩니다)

### 2. Edge Function 배포
```bash
npm install -g supabase
supabase login
supabase link --project-ref <project-ref>
supabase functions deploy lookup
supabase functions deploy issue-certificate
supabase functions deploy cancel-application
```
`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 는 Supabase가 모든 Edge Function에
자동으로 주입하므로 별도 시크릿 설정이 필요 없습니다.

### 3. GitHub Pages 활성화
1. 저장소 Settings → Pages → Build and deployment → **Source: GitHub Actions** 선택
2. Settings → Secrets and variables → Actions
   - **Secrets**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Variables**(선택, 커스텀 도메인을 쓰는 경우만): `NEXT_PUBLIC_BASE_PATH` = `""`
     (기본값은 저장소 이름 기준 `/<repo-name>` 서브패스로 자동 설정됩니다)
3. `main` 브랜치에 push하면 `.github/workflows/deploy-pages.yml` 워크플로우가 자동으로 빌드·배포합니다
   (수동 실행은 Actions 탭 → Deploy to GitHub Pages → Run workflow)

## 로컬 개발

```bash
cp .env.example .env.local   # 값 채우기
npm install
npm run dev
```

정적 export 산출물을 로컬에서 직접 확인하려면:
```bash
npm run build && npm run preview   # http://localhost:3000 (out/ 디렉터리를 정적 서빙)
```

## 검증 (CI)

`main`으로 들어가는 PR은 `.github/workflows/ci.yml`이 자동 검증합니다.

```bash
npm run lint && npm run typecheck && npm run build   # 프론트엔드

cd supabase/functions && deno check */index.ts && deno lint   # Edge Function(Deno)
```

Edge Function은 Next 빌드에 포함되지 않아 `tsc`가 보지 못하므로 Deno로 따로 검증합니다.
`supabase/functions/deno.json`이 이 디렉터리를 독립 스코프로 만들어, 저장소 루트의
`package.json`(Next 앱용) 때문에 Deno가 `node_modules`를 요구하지 않도록 합니다.

DB 마이그레이션·RLS·트리거 회귀 테스트는 순수 Postgres에서 실행합니다.
(Supabase가 기본 제공하는 역할·`auth.jwt()`·`storage` 객체는 `supabase/tests/_shim.sql`이 대신 만듭니다 —
실제 Supabase 프로젝트에는 적용하지 마세요.)

```bash
createdb glocal_test
psql -d glocal_test -v ON_ERROR_STOP=1 -f supabase/tests/_shim.sql
for f in supabase/migrations/*.sql; do psql -d glocal_test -v ON_ERROR_STOP=1 -f "$f"; done
for f in supabase/tests/*.test.sql; do psql -d glocal_test -v ON_ERROR_STOP=1 -f "$f"; done
```

테스트는 하나의 트랜잭션에서 실행 후 `ROLLBACK`하므로 DB에 아무것도 남기지 않습니다.

## 폴더 구조 메모

- `src/app/(portal)` — 신청 포털 공개 4탭(소개/신청/신청내역조회/만족도조사)
- `src/app/admin` — 관리자 포털(구글 OAuth 로그인 + 신청자 관리 + 만족도 설문결과)
- `supabase/migrations` — DB 스키마, RLS 정책, 트리거/함수, 시드 데이터
- `supabase/functions` — Edge Function(Deno) 소스
- `supabase/tests` — DB 회귀 테스트(psql로 실행) + 순수 Postgres용 shim
- `docs/SYSTEM_IMPROVEMENT_REVIEW.md` — 시스템 개선·보완 검토 보고서(남은 과제 목록)
- `.github/workflows/ci.yml` — PR 검증(lint·typecheck·build + DB 테스트)
- `.github/workflows/deploy-pages.yml` — GitHub Pages 자동 배포
