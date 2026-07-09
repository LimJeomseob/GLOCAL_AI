const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const DATETIME_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const TIME_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return DATETIME_FMT.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return TIME_FMT.format(new Date(iso));
}

export function formatDateRange(startIso: string, endIso: string): string {
  return `${formatDate(startIso)} ${formatTime(startIso)}~${formatTime(endIso)}`;
}

/** KST 기준 연/월/일/시/분 부품을 얻는다(수료증 서식 표기용). */
function kstParts(iso: string): { y: string; m: string; d: string; hh: string; mm: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute") };
}

/** 수료증 '기간' 란 표기: 2026.07.29. 14:00 ~ 16:00 (서식 원본 형식) */
export function formatCertPeriod(startIso: string, endIso: string): string {
  const s = kstParts(startIso);
  const e = kstParts(endIso);
  return `${s.y}.${s.m}.${s.d}. ${s.hh}:${s.mm} ~ ${e.hh}:${e.mm}`;
}

/** 수료증 '발급일' 표기: 2026년 08월 01일 (서식 원본 형식) */
export function formatCertIssueDate(iso: string): string {
  const p = kstParts(iso);
  return `${p.y}년 ${p.m}월 ${p.d}일`;
}

/** 저장된 연락처를 010-####-#### 형식으로 표시(대상자 명단 표기용) */
export function formatPhone(raw: string): string {
  const d = (raw ?? "").replace(/[^0-9]/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw ?? "";
}
