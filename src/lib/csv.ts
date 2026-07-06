/**
 * 범용 CSV 내보내기 유틸. 신청자 관리 / 만족도 설문결과 등 관리자 화면에서
 * 현재 화면에 표시된(필터링된) 데이터를 CSV로 내보낼 때 공통으로 사용한다.
 */

// Excel/Sheets는 셀이 =,+,-,@,탭,CR로 시작하면 수식으로 해석한다. 신청자가 입력한
// 성명/소속 등이 그대로 들어가므로, 내보내기 전 선행 문자를 무력화해 수식 인젝션을 막는다.
const FORMULA_TRIGGER_CHARS = /^[=+\-@\t\r]/;

/** CSV 셀 값 하나를 이스케이프한다(쉼표/줄바꿈/따옴표 포함 시 큰따옴표로 감싸기, 수식 인젝션 방지). */
function escapeCsvCell(value: unknown): string {
  let str = value === null || value === undefined ? "" : String(value);
  if (FORMULA_TRIGGER_CHARS.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface CsvColumn<T> {
  header: string;
  accessor: (row: T) => unknown;
}

/** rows를 CSV 문자열로 변환한다. 엑셀(한글 Windows)에서 깨지지 않도록 BOM을 포함한다. */
export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map((c) => escapeCsvCell(c.header)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvCell(c.accessor(row))).join(",")
  );
  return ["﻿" + headerLine, ...lines].join("\r\n");
}

/** 브라우저에서 CSV 문자열을 파일로 다운로드시킨다. */
export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** rows를 CSV로 변환 후 즉시 다운로드하는 편의 함수. */
export function exportRowsAsCsv<T>(rows: T[], columns: CsvColumn<T>[], filename: string): void {
  const csv = buildCsv(rows, columns);
  downloadCsv(filename, csv);
}

/**
 * CSV 텍스트를 2차원 문자열 배열로 파싱한다(일괄 추가 업로드용).
 * BOM 제거, CRLF/LF 혼용, 큰따옴표 셀("" 이스케이프, 셀 내 쉼표·줄바꿈) 처리.
 * 완전히 빈 행은 결과에서 제외한다.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
