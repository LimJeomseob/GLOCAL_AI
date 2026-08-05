# 시스템 개선·보완 검토 보고서

- 검토일: 2026-08-05
- 대상: 글로컬 AI 동행 포털 전체 (Next.js 정적 프론트엔드 + Supabase RLS/Edge Function + GitHub Pages 배포)
- 검토 범위: 보안, 데이터 무결성, 운영 안정성, 코드 품질, 기능 로드맵

전반적으로 아키텍처 문서화(README/PRD), RLS 기반 접근 통제, 정원 검증의 advisory lock,
CSV 수식 인젝션 방어, 취소 시 상태 재검증 등 완성도가 높은 편입니다. 아래는 우선순위별
개선·보완 제안입니다.

## 조치 현황

| 항목 | 상태 | 반영 위치 |
|---|---|---|
| P0-1 status·cert_issued 위조 차단 | **완료** | `supabase/migrations/0012_public_insert_hardening.sql` |
| P0-2 중복 신청(정원 선점) 차단 | **완료** | 동 마이그레이션 (트리거 내 P0005) |
| P1-9 DB 오류 메시지 매핑 | **완료** | `src/lib/dbErrors.ts` |
| P1-6 PR 단계 CI | **완료** | `.github/workflows/ci.yml` |
| P1-7 테스트(DB 회귀분) | **부분 완료** | `supabase/tests/0012_public_insert_hardening.test.sql` (단언 12건) |
| 그 외 | 미착수 | 아래 본문 참조 |

입력 길이 제한(`applications_text_length_chk`, `lawdata_text_length_chk`)도 함께 추가했습니다.
회귀 테스트는 수정 전 스키마(0011까지)에서 첫 단언부터 실패하는 것을 확인해, 취약점이 실재했고
테스트가 유효함을 검증했습니다.

---

## P0 — 보안 취약점 (즉시 조치 권장)

### 1. 공개 신청 INSERT에서 `status`·`cert_issued` 위조 가능 → 수료증 부정 발급 경로 — **조치 완료**

`applications`의 공개 INSERT 정책은 `with check (true)`이므로 컬럼 값을 제한하지 못합니다.
`0011_admin_application_override.sql`이 `created_by_admin` 위조는 트리거에서 차단했지만
(`new.created_by_admin := false`), **`status`와 `cert_issued`는 차단하지 않습니다.**

공격 시나리오:

1. 익명 사용자가 anon key로 PostgREST에 직접 `status='이수'`인 신청 행을 INSERT
   (브라우저 폼을 거치지 않고 REST 호출만으로 가능 — anon key는 정적 사이트에 공개되어 있음)
2. 본인이 입력한 성명+연락처로 `issue-certificate` Edge Function 호출
3. **실제 수강 없이 정식 발급번호가 채번된 수료증 PDF 발급 완료**

부수 문제: 정원 트리거는 `status in ('신청완료','이수')`만 집계하므로 `status='대기'` 또는
`'취소'`로 INSERT하면 **오픈 전·마감 후·정원 초과와 무관하게 무한 행 삽입**이 가능합니다.

**조치 제안** — `check_application_capacity()` 트리거의 비관리자 분기에서 강제:

```sql
-- 공개 신청 경로: 상태·발급 플래그 위조를 차단한다.
new.status := '신청완료';
new.cert_issued := false;
new.created_by_admin := false;  -- 기존 로직
```

트리거는 `security definer`이고 이미 비관리자 분기가 있으므로 마이그레이션 1건으로 해결됩니다.

> **조치됨** — 0012에서 비관리자 분기에 위 3개 컬럼 강제를 추가했습니다. `status` 강제로
> "대기/취소 상태로 넣어 정원·마감 검사를 우회"하던 경로도 함께 막혔습니다.

### 2. 중복 신청·정원 선점 공격 방어 부재 — **조치 완료**

동일인(동일 연락처)이 같은 회차에 여러 건 신청하는 것을 막는 제약이 없습니다.
악의적 사용자가 스크립트로 허위 신청을 반복하면 **정원을 모두 선점해 실제 신청을
차단(좌석 고갈 DoS)** 할 수 있습니다.

**조치 제안:**

```sql
-- 활성 상태(취소 제외) 기준 동일 회차 + 동일 연락처 1건 제한
create unique index applications_active_phone_uniq
  on public.applications (workshop_id, regexp_replace(phone, '[^0-9]', '', 'g'))
  where status in ('신청완료', '대기', '이수');
```

- 전화번호는 하이픈 유무가 섞여 저장되므로 정규화 식 기반 인덱스로 걸어야 합니다.
- 관리자 등록(참여자 추가)도 동일 제약을 받게 되므로, 예외가 필요하면 트리거 방식으로 전환.
- 폼에는 "이미 신청된 연락처입니다" 오류 매핑 추가.

> **조치됨 — 단, unique 인덱스가 아닌 트리거 방식으로 구현했습니다.**
> 관리자 "참여자 추가"는 대리 신청·재등록을 위해 동일 연락처 중복 등록을 확인 후 허용하는
> 기존 동작(`ApplicantsTable.tsx`의 confirm 분기)이 있어, 전역 unique 인덱스는 이 기능을
> 깨뜨립니다. 대신 `check_application_capacity()`의 **비관리자 분기에서만** 중복을 검사합니다.
> 함수 선두의 `pg_advisory_xact_lock`이 해당 회차의 모든 INSERT를 직렬화하므로 unique
> 인덱스와 동일하게 경쟁 조건이 없습니다. 취소 건은 제외해 취소 후 재신청은 허용합니다.

### 3. 공개 엔드포인트 rate limit·봇 방어 부재

`lookup` / `cancel-application` / `issue-certificate` Edge Function과 공개 INSERT(신청·설문)에
호출 횟수 제한이 없습니다.

- 성명+연락처 무차별 대입으로 타인 신청 내역 조회·**타인 신청 취소**가 가능
  (성명은 공개적으로 알기 쉽고, 연락처 뒷자리 대입은 자동화 가능)
- 만족도조사(`LAWdata`)도 `with check (true)` INSERT라 스팸 응답으로 통계 오염 가능

**조치 제안 (난이도 순):**

1. Edge Function에 IP 기준 간단한 rate limit (Postgres 카운터 테이블 또는 Upstash Redis,
   예: 분당 5회) — 실패 응답에 지수 지연 포함
2. 신청·설문 INSERT를 Edge Function 경유로 전환하고 Cloudflare Turnstile(무료) 검증 추가
3. 취소·수료증 발급은 성명+연락처 외 추가 본인확인 요소 1개 도입
   (신청 시 입력한 `id_number` 뒷자리 또는 이메일 인증 코드)

---

## P1 — 개인정보 보호·운영 안정성

### 4. 개인정보 보유기간 자동화 부재

신청 폼 고지는 "특강 종료 후 1년 또는 관계 법령에 따름"인데, 실제 파기 메커니즘이 없습니다.

**조치 제안:** Supabase `pg_cron`으로 종료 1년 경과 회차의 신청 행을
익명화(성명·연락처·이메일·id_number 마스킹)하는 주기 작업 추가. 수료증 발급 이력(발급번호)은
통계·검증용으로 유지하되 개인 식별자는 제거.

### 5. CORS 와일드카드(`*`) 제한

`_shared/cors.ts`가 모든 origin을 허용합니다. 공개 API이므로 치명적이진 않지만, 봇 방어와
결합해 배포 origin(GitHub Pages 주소)만 허용하도록 좁히는 것이 좋습니다
(환경변수 `ALLOWED_ORIGIN`으로 주입, 로컬 개발용 localhost 허용 포함).

### 6. PR 단계 CI 부재 — main push 즉시 배포 — **조치 완료**

`deploy-pages.yml`은 main push에서 빌드·배포만 합니다. PR에서 검증이 없어 깨진 코드가
main에 들어가면 곧바로 운영 사이트에 반영됩니다.

**조치 제안:** PR 대상 `ci.yml` 추가 — `npm ci && npm run lint && npm run typecheck && npm run build`.
main 브랜치 보호 규칙(필수 체크)과 함께 적용.

> **조치됨** — `.github/workflows/ci.yml`에 두 개 job을 추가했습니다.
> `verify`(lint·typecheck·build)와 `db`(postgres:16 서비스 컨테이너에 마이그레이션 전체 적용 후
> `supabase/tests/*.test.sql` 실행).
> **남은 수동 작업:** 저장소 Settings → Branches에서 main 브랜치 보호 규칙을 켜고 이 두 체크를
> 필수(required)로 지정해야 실제로 병합이 차단됩니다.

### 7. 테스트 부재 — **부분 조치**

테스트가 전무합니다. 최소한의 안전망으로:

- **단위 테스트(Vitest):** `validation.ts`(전화번호 정규식 경계), `csv.ts`(수식 인젝션·이스케이프),
  `format.ts` — 순수 함수라 도입 비용이 가장 낮음
- **DB 테스트:** RLS 정책·정원 트리거 회귀 테스트 (`supabase test db` / pgTAP).
  특히 P0-1 수정 후 "비관리자 INSERT는 status가 항상 신청완료" 검증을 고정
- **E2E smoke(Playwright):** 신청 → 조회 → 취소 핵심 흐름 1개

> **부분 조치됨** — DB 회귀 테스트를 먼저 도입했습니다
> (`supabase/tests/0012_public_insert_hardening.test.sql`, 단언 12건, CI에서 자동 실행).
> pgTAP 의존 없이 순수 psql로 돌도록 작성했고, 트랜잭션 안에서 실행 후 ROLLBACK합니다.
> **남은 것:** `validation.ts`/`csv.ts`/`format.ts` 단위 테스트(Vitest)와 E2E smoke.

### 8. 오류 관측(Observability) 부재

프론트 오류·Edge Function 실패를 알 방법이 Supabase 로그 수동 확인뿐입니다.
Sentry(무료 플랜) 프론트 연동 또는 최소한 Edge Function 오류 시 관리자 이메일/웹훅 알림을
권장합니다. 특히 수료증 발급은 RPC 성공 후 브라우저 업로드 실패 시 pdf 없는 발급 건이
생길 수 있어(재시도로 복구는 가능) 실패 감지가 유용합니다.

### 9. 원본 DB 오류 메시지 노출 — **조치 완료**

`ApplicationForm`이 `error.message`를 그대로 표시합니다. 트리거의 한글 예외(P0001~P0004)는
괜찮지만, 그 외 Postgres/PostgREST 오류는 영어 원문·내부 정보가 노출됩니다.
errcode → 사용자 메시지 매핑 테이블을 두고 알 수 없는 오류는 일반 문구로 대체하세요.
(P0-2의 unique 위반 → "이미 신청된 연락처입니다" 매핑도 여기서 처리)

> **조치됨** — `src/lib/dbErrors.ts`의 `toUserMessage()`(신청·설문 폼)와
> `toAdminMessage()`(관리자 화면, 미매핑 오류는 원문 유지)를 추가하고
> `ApplicationForm`·`SurveyForm`·`ApplicantsTable`에 적용했습니다.

---

## P2 — 코드 품질·유지보수

### 10. `ApplicantsTable.tsx` 1,405줄 모놀리식 컴포넌트

필터·정렬·인라인 편집·참여자 추가·일괄 변경·CSV 내보내기가 한 파일에 있습니다.
기능 추가가 반복되는 파일(#16, #21, #24~26)이므로 회귀 위험이 커지고 있습니다.
`useApplicantsFilter` 훅, `ApplicantRow`, `AddApplicantRow`, `BulkActionsBar` 정도로 분리 권장.

### 11. 회차(workshops) 관리가 SQL 마이그레이션으로만 가능

회차 추가(0007)·마감 연장(0010) 같은 **운영성 데이터 변경이 스키마 마이그레이션에 섞여**
있습니다. 매번 개발자가 필요하고 이력 추적도 어렵습니다. 관리자 포털에 회차 CRUD 탭
(정원·마감·오픈시각·라벨 수정)을 추가하면 운영 부담이 크게 줄어듭니다.
RLS는 `workshops_update_admin` 정책 추가로 충분합니다.

### 12. 수료증 일련번호 채번 방식

`count(*) + 1` 방식은 신청 행 삭제 시(cascade로 수료증 행도 삭제) **이미 발급된 번호가
재사용**될 수 있습니다. 종이 수료증과 번호가 충돌하면 진위 검증이 무너지므로, 회차별
시퀀스 테이블(`cert_serials(round, last_serial)`)로 전환을 권장합니다.

### 13. Edge Function 간 코드 중복

`PHONE_REGEX`·`normalizePhone`·본인확인 로직이 3개 함수에 중복되어 있습니다.
`_shared/identity.ts`로 추출하면 P0-3(추가 본인확인)도 한 곳에서 적용됩니다.

### 14. 의존성 업그레이드 (긴급 아님)

Next 14.2 / React 18 / zod 3은 당장 문제없지만 유지보수 기한을 고려해 다음 방학 등
한가한 시점에 Next 15 + React 19, zod 4 마이그레이션을 계획해 두세요.
업그레이드 전 P1-6(CI)·P1-7(테스트)이 먼저 갖춰져야 안전합니다.

---

## P2 — 기능 로드맵 제안

- **알림 자동화:** `kakao_notifications`는 스키마만 존재합니다. 알림톡 계약 전이라면
  이메일(Resend 등 무료 티어) 기반 신청 확인·D-2 리마인드부터 Edge Function + `pg_cron`으로
  구현하는 것이 현실적입니다. 안내메세지 1·2·3차 수동 확인 부담도 줄어듭니다.
- **대기자 자동 승격:** 취소 발생 시 해당 회차 `대기` 중 가장 오래된 건을 `신청완료`로
  승격하는 옵션(트리거 또는 관리자 원클릭). 현재는 수동 관리입니다.
- **수료증 진위 확인 페이지:** 발급번호 입력 → 발급 여부·회차·발급일만 확인(개인정보 미노출).
  기관 제출용 수료증의 신뢰도를 높입니다.

---

## 권장 조치 순서 요약

| 순서 | 항목 | 규모 | 상태 |
|---|---|---|---|
| 1 | P0-1 status/cert_issued 위조 차단 (마이그레이션 1건) | 소 | 완료 |
| 2 | P0-2 중복 신청 차단 + 오류 메시지 매핑(P1-9) | 소 | 완료 |
| 3 | P1-6 PR CI 워크플로 | 소 | 완료 (브랜치 보호 규칙 설정만 남음) |
| 4 | P0-3 rate limit → Turnstile → 추가 본인확인 (단계적) | 중 | 다음 우선순위 |
| 5 | P1-7 단위·RLS 테스트 | 중 | DB 회귀분 완료, 단위·E2E 남음 |
| 6 | P1-4 개인정보 파기 자동화, P1-5 CORS 제한 | 소 | 미착수 |
| 7 | P2 리팩터링·회차 관리 UI·알림 자동화 | 중~대 | 미착수 |

## 배포 시 유의사항

`0012_public_insert_hardening.sql`은 **운영 DB에 적용해야 효력이 생깁니다.**
Supabase CLI(`supabase db push`) 또는 대시보드 SQL Editor에서 실행하세요.
프론트엔드만 배포하면 취약점은 그대로 남습니다.

적용 후 확인할 것:
- 기존 신청자가 같은 회차에 **중복 신청된 상태로 남아 있어도** 새 제약은 신규 INSERT에만
  적용되므로 기존 데이터는 영향받지 않습니다.
- 길이 제약은 `not valid`로 추가되어 기존 행을 검증하지 않습니다. 나중에 정리한 뒤
  `alter table ... validate constraint ...`로 승격할 수 있습니다.
