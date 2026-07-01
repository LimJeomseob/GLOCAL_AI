# 글로컬 AI 동행 포털

경상국립대학교 글로컬대학30 사업 「일과 삶을 바꾸는 생성형 AI 실무과정」 특강 신청·관리 포털 (`PRD.md` 참조).

이 저장소는 **완전 정적 사이트(Next.js `output: 'export'`)** 로 빌드되어 **GitHub Pages** 에 배포됩니다.
서버가 필요한 로직(신청내역조회, 수료증 PDF 발급)은 **Supabase Edge Function** 으로 분리되어 있습니다.

## 아키텍처 요약

- 프론트엔드: Next.js(App Router, 정적 export) + Tailwind CSS → GitHub Pages
- 데이터/인증: Supabase(Postgres, Auth, RLS, Storage) — 브라우저에서 anon key로 직접 접근, 접근 통제는 전부 RLS
- 서비스 롤 키로 RLS를 우회해야 하는 유일한 작업(신청내역조회, §5.3)만 Supabase Edge Function으로 처리
  - `supabase/functions/lookup` — 성명+연락처가 정확히 일치하는 신청 건만 서버에서 필터링해 반환
- 수료증 PDF 발급/재발급(§6.4)은 Edge Function이 아니라 **관리자의 브라우저**에서 직접 생성합니다
  (`src/lib/certificatePdf.ts`, `src/lib/issueCertificate.ts`). `issue_certificate()` RPC 호출과
  Storage 업로드 모두 RLS의 `is_admin()` 체크로 통제되므로 관리자가 아니면 실행되지 않습니다.
  Deno(Supabase Edge Function) 환경에서는 `@pdf-lib/fontkit`이 내부적으로
  `Object.prototype.__proto__` 조작에 의존하는 부분이 있어 Deno의 보안 기본값과 충돌해
  런타임에 실패하는 것을 배포 전 스모크 테스트로 확인했습니다 — 그래서 브라우저 실행으로 우회했습니다.
- 관리자 인증: Supabase Auth 구글 OAuth + `admin_users` allowlist. 서버 미들웨어가 없으므로
  접근 통제는 클라이언트 라우트 가드(`useAdminSession`) + Supabase RLS(`is_admin()`)의 이중 구조입니다.

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

## 폴더 구조 메모

- `src/app/(portal)` — 신청 포털 공개 4탭(소개/신청/신청내역조회/만족도조사)
- `src/app/admin` — 관리자 포털(구글 OAuth 로그인 + 신청자 관리 + 만족도 설문결과)
- `supabase/migrations` — DB 스키마, RLS 정책, 트리거/함수, 시드 데이터
- `supabase/functions` — Edge Function(Deno) 소스
- `.github/workflows/deploy-pages.yml` — GitHub Pages 자동 배포
