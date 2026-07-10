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
supabase functions deploy kakao-digest --no-verify-jwt
```
`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 는 Supabase가 모든 Edge Function에
자동으로 주입하므로 별도 시크릿 설정이 필요 없습니다.

### 2-1. 카카오 알림톡 · 관리자 알림 메일 설정 (1일 2회 대상자 다이제스트)
알림톡 발송 대상자 명단을 **하루 2회(오전 9시·오후 4시 KST)** 관리자 이메일로 보내는 기능.
메일에는 대상자별 `[ID, 성명, 연락처(010-####-####)]` 와 관리자가 편집한 알림톡 문구가 함께 담긴다.
문구는 관리자 포털 → 신청자 관리 → "카카오 알림톡 · 관리자 알림 메일" 패널에서 직접 편집한다.

1. **마이그레이션 적용**: `supabase db push` (또는 대시보드 SQL Editor에서 `0003_kakao_digest.sql` 실행).
2. **이메일 공급자(Resend) 준비**: [resend.com](https://resend.com) 가입 → API Key 발급, 발신 주소(도메인 인증 또는
   테스트용 `onboarding@resend.dev`) 확보 후 Edge Function secrets 등록:
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="특강알림 <onboarding@resend.dev>"
   supabase secrets set KAKAO_TRIGGER_SECRET=<임의의-긴-난수문자열>
   ```
   - `RESEND_API_KEY`/`MAIL_FROM` 미설정 시에도 앱은 정상 동작하며, 발송 시 "미구성" 안내만 표시된다.
3. **스케줄러(GitHub Actions) 시크릿**: 저장소 Settings → Secrets and variables → Actions → Secrets 에 추가:
   - `SUPABASE_FUNCTIONS_URL` = `https://<project-ref>.supabase.co/functions/v1`
   - `SUPABASE_ANON_KEY` = 프로젝트 anon 키(공개 키)
   - `KAKAO_TRIGGER_SECRET` = 위 2번에서 정한 것과 동일한 값
   → `.github/workflows/kakao-digest.yml` 이 09:00/16:00 KST에 자동 호출(수동은 Actions 탭 → Kakao Digest Email → Run workflow).
4. **대상자 이메일 수신자**: `admin_users` 테이블의 이메일 전체가 다이제스트 메일 수신자다.

> 참고: 신청자에게 카카오 알림톡을 **직접** 발송하려면 별도의 유료 발송 대행사(솔라피 등) 채널 개설·템플릿 심사·발송키가
> 필요하다(후속 옵션). 본 구현은 그 전 단계로, 관리자에게 대상자 명단+문구를 메일로 제공한다.

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
