/**
 * 범용 CSV 내보내기 유틸. 신청자 관리 / 만족도 설문결과 등 관리자 화면에서
 * 현재 화면에 표시된(필터링된) 데이터를 CSV로 내보낼 때 공통으로 사용한다.
 */

/** CSV 셀 값 하나를 이스케이프한다(쉼표/줄바꿈/따옴표 포함 시 큰따옴표로 감싸기). */
function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
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
