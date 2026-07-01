// 저장된 연락처를 010-####-#### 형식으로 정규화한다(대상자 명단 표기용).
// 프론트의 normalizePhone(숫자만 추출)과 짝을 이루는 표시용 포맷터.
export function formatPhone(raw: string): string {
  const d = (raw ?? "").replace(/[^0-9]/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw ?? "";
}
