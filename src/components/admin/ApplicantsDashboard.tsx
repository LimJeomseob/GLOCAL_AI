"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { formatDateRange } from "@/lib/format";
import { KAKAO_NOTICE_COLUMNS } from "@/lib/constants";
import type { ApplicationWithWorkshop } from "@/lib/types";

/** 회차 × 소속 단위로 집계한 대시보드 행 */
interface DashboardRow {
  key: string;
  round: number;
  topic: string;
  startAt: string;
  endAt: string;
  affiliation: string;
  count: number;
  /** KAKAO_NOTICE_COLUMNS의 각 단계별 발송 완료 건수 */
  noticeSent: number[];
}

type SortDir = "asc" | "desc";
/** 정렬 기준 키. 카톡 단계는 `notice-<index>` 형식 */
type SortKey = "round" | "topic" | "startAt" | "affiliation" | "count" | `notice-${number}`;

interface SortState {
  key: SortKey;
  dir: SortDir;
}

/** 상단(회차~신청 인원) 정렬 가능 컬럼 정의 */
const BASE_COLUMNS: { key: SortKey; label: string; thClass: string }[] = [
  { key: "round", label: "회차", thClass: "w-14" },
  { key: "topic", label: "프로그램명", thClass: "" },
  { key: "startAt", label: "프로그램 일시", thClass: "w-40" },
  { key: "affiliation", label: "소속", thClass: "" },
  { key: "count", label: "신청 인원", thClass: "w-20" },
];

/** 발송/전체 비율에 따른 셀 강조(전체 발송=emerald, 미발송=slate, 일부=amber) */
function noticeCellClass(sent: number, total: number): string {
  if (total > 0 && sent === total) return "bg-emerald-100 text-emerald-800";
  if (sent === 0) return "bg-slate-100 text-slate-500";
  return "bg-amber-100 text-amber-800";
}

/** 정렬 상태 아이콘: 비활성=중립(↕), 활성=방향(▲/▼) */
function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span aria-hidden className={clsx("text-[9px] leading-none", active ? "text-brand" : "text-slate-300")}>
      {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
    </span>
  );
}

/** 클릭 시 해당 컬럼으로 정렬하는 헤더 버튼 */
function HeaderButton({
  label,
  sortKey,
  sort,
  onSort,
  labelClass,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  labelClass?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={clsx(
        "flex w-full items-center justify-center gap-1 font-semibold transition-colors hover:text-brand",
        active ? "text-brand" : "text-slate-600"
      )}
    >
      <span className={clsx("break-keep", labelClass)}>{label}</span>
      <SortIcon active={active} dir={sort.dir} />
    </button>
  );
}

function ariaSort(active: boolean, dir: SortDir): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return dir === "asc" ? "ascending" : "descending";
}

export function ApplicantsDashboard({
  applications,
}: {
  applications: ApplicationWithWorkshop[];
}) {
  const [sort, setSort] = useState<SortState>({ key: "round", dir: "asc" });

  const rows = useMemo<DashboardRow[]>(() => {
    const groups = new Map<string, DashboardRow>();

    for (const a of applications) {
      const affiliation = a.affiliation?.trim() || "(미기재)";
      const key = `${a.workshop.round}__${affiliation}`;
      let row = groups.get(key);
      if (!row) {
        row = {
          key,
          round: a.workshop.round,
          topic: a.workshop.topic,
          startAt: a.workshop.start_at,
          endAt: a.workshop.end_at,
          affiliation,
          count: 0,
          noticeSent: KAKAO_NOTICE_COLUMNS.map(() => 0),
        };
        groups.set(key, row);
      }
      row.count += 1;
      KAKAO_NOTICE_COLUMNS.forEach(({ field }, i) => {
        if (a[field]) row!.noticeSent[i] += 1;
      });
    }

    return Array.from(groups.values());
  }, [applications]);

  const sortedRows = useMemo<DashboardRow[]>(() => {
    const { key, dir } = sort;
    const factor = dir === "asc" ? 1 : -1;

    function primary(a: DashboardRow, b: DashboardRow): number {
      if (key === "round") return a.round - b.round;
      if (key === "topic") return a.topic.localeCompare(b.topic, "ko");
      if (key === "startAt") return a.startAt.localeCompare(b.startAt);
      if (key === "affiliation") return a.affiliation.localeCompare(b.affiliation, "ko");
      if (key === "count") return a.count - b.count;
      // notice-<index>
      const i = Number(key.slice("notice-".length));
      return a.noticeSent[i] - b.noticeSent[i];
    }

    return [...rows].sort((a, b) => {
      const cmp = primary(a, b);
      if (cmp !== 0) return cmp * factor;
      // 동점일 때는 방향과 무관하게 회차 → 소속 순으로 안정적으로 정렬한다.
      return a.round - b.round || a.affiliation.localeCompare(b.affiliation, "ko");
    });
  }, [rows, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  }

  const kakaoGroupActive = sort.key.startsWith("notice-");

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
      <div>
        <h2 className="text-base font-bold text-brand">신청 현황 대시보드</h2>
        <p className="mt-1 text-xs text-slate-500">
          회차 × 소속별 신청 인원과 카톡 안내 발송 진행 현황(발송/전체)을 한눈에 확인할 수 있습니다. 열 제목을 클릭하면
          해당 항목으로 정렬됩니다.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-center text-xs">
          <caption className="sr-only">회차 및 소속별 신청 현황·카톡 안내 발송 집계 대시보드</caption>
          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              {BASE_COLUMNS.map(({ key, label, thClass }) => {
                const active = sort.key === key;
                return (
                  <th
                    key={key}
                    scope="col"
                    rowSpan={2}
                    aria-sort={ariaSort(active, sort.dir)}
                    className={clsx("px-2 py-2 text-center align-bottom", thClass)}
                  >
                    <HeaderButton label={label} sortKey={key} sort={sort} onSort={toggleSort} />
                  </th>
                );
              })}
              <th
                scope="colgroup"
                colSpan={KAKAO_NOTICE_COLUMNS.length}
                className={clsx("px-1 py-1 text-center", kakaoGroupActive && "text-brand")}
              >
                카톡 안내 발송
              </th>
            </tr>
            <tr>
              {KAKAO_NOTICE_COLUMNS.map(({ field, label }, i) => {
                const key = `notice-${i}` as SortKey;
                const active = sort.key === key;
                return (
                  <th
                    key={field}
                    scope="col"
                    aria-sort={ariaSort(active, sort.dir)}
                    className="w-20 px-1 py-1 text-center align-bottom"
                  >
                    <HeaderButton
                      label={label}
                      sortKey={key}
                      sort={sort}
                      onSort={toggleSort}
                      labelClass="text-[10px] leading-tight"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.map((row) => (
              <tr key={row.key} className="align-top">
                <td className="whitespace-nowrap px-2 py-2 text-center font-semibold text-slate-800">
                  {row.round}차
                </td>
                <td className="break-keep px-2 py-2 text-left text-slate-700">{row.topic}</td>
                <td className="px-2 py-2 text-left text-slate-700">
                  {formatDateRange(row.startAt, row.endAt)}
                </td>
                <td className="break-keep px-2 py-2 text-left text-slate-700">{row.affiliation}</td>
                <td className="px-2 py-2 text-center font-semibold text-slate-800">{row.count}명</td>
                {KAKAO_NOTICE_COLUMNS.map(({ field, label }, i) => (
                  <td key={field} className="px-1 py-2 text-center">
                    <span
                      className={clsx(
                        "inline-flex items-center rounded-full px-2 py-1 text-xs font-bold tabular-nums",
                        noticeCellClass(row.noticeSent[i], row.count)
                      )}
                      aria-label={`${row.round}차 ${row.affiliation} ${label} ${row.noticeSent[i]}/${row.count} 발송`}
                    >
                      {row.noticeSent[i]}/{row.count}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
            {sortedRows.length === 0 && (
              <tr>
                <td
                  colSpan={BASE_COLUMNS.length + KAKAO_NOTICE_COLUMNS.length}
                  className="px-3 py-8 text-center text-sm text-slate-500"
                >
                  표시할 신청 현황이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
