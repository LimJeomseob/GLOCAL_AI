-- 기존 신청 데이터의 연락처를 010-####-#### 표준 형식으로 일괄 정규화한다.
-- 앱단(phoneSchema transform)이 신규 저장분을 표준화하므로, 이 마이그레이션은 과거 데이터만 정리한다.
-- 규칙은 src/lib/format.ts의 formatPhone과 동일: 숫자만 추출 후 11자리는 3-4-4, 10자리는 3-3-4.
update public.applications
set phone = case length(regexp_replace(phone, '[^0-9]', '', 'g'))
  when 11 then
    substring(regexp_replace(phone, '[^0-9]', '', 'g') from 1 for 3) || '-' ||
    substring(regexp_replace(phone, '[^0-9]', '', 'g') from 4 for 4) || '-' ||
    substring(regexp_replace(phone, '[^0-9]', '', 'g') from 8 for 4)
  when 10 then
    substring(regexp_replace(phone, '[^0-9]', '', 'g') from 1 for 3) || '-' ||
    substring(regexp_replace(phone, '[^0-9]', '', 'g') from 4 for 3) || '-' ||
    substring(regexp_replace(phone, '[^0-9]', '', 'g') from 7 for 4)
  else phone
end
where phone !~ '^01[0-9]-[0-9]{3,4}-[0-9]{4}$'
  and length(regexp_replace(phone, '[^0-9]', '', 'g')) in (10, 11);
