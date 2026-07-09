"use client";

import { useMemo } from "react";
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

/** 발송/전체 비율에 따른 셀 강조(전체 발송=emerald, 미발송=slate, 일부=amber) */
function noticeCellClass(sent: number, total: number): string {
  if (total > 0 && sent === total) return "bg-emerald-100 text-emerald-800";
  if (sent === 0) return "bg-slate-100 text-slate-500";
  return "bg-amber-100 text-amber-800";
}

export function ApplicantsDashboard({
  applications,
}: {
  applications: ApplicationWithWorkshop[];
}) {
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

    return Array.from(groups.values()).sort(
      (a, b) => a.round - b.round || a.affiliation.localeCompare(b.affiliation, "ko")
    );
  }, [applications]);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
      <div>
        <h2 className="text-base font-bold text-brand">신청 현황 대시보드</h2>
        <p className="mt-1 text-xs text-slate-500">
          회차 × 소속별 신청 인원과 카톡 안내 발송 진행 현황(발송/전체)을 한눈에 확인할 수 있습니다.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-left text-xs">
          <caption className="sr-only">회차 및 소속별 신청 현황·카톡 안내 발송 집계 대시보드</caption>
          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              <th scope="col" rowSpan={2} className="w-14 px-2 py-2 align-bottom">
                회차
              </th>
              <th scope="col" rowSpan={2} className="px-2 py-2 align-bottom">
                프로그램명
              </th>
              <th scope="col" rowSpan={2} className="w-40 px-2 py-2 align-bottom">
                프로그램 일시
              </th>
              <th scope="col" rowSpan={2} className="px-2 py-2 align-bottom">
                소속
              </th>
              <th scope="col" rowSpan={2} className="w-16 px-2 py-2 text-center align-bottom">
                신청 인원
              </th>
              <th scope="colgroup" colSpan={KAKAO_NOTICE_COLUMNS.length} className="px-1 py-1 text-center">
                카톡 안내 발송
              </th>
            </tr>
            <tr>
              {KAKAO_NOTICE_COLUMNS.map(({ field, label }) => (
                <th
                  key={field}
                  scope="col"
                  className="w-20 break-keep px-1 py-1 text-center text-[10px] leading-tight"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.key} className="align-top">
                <td className="whitespace-nowrap px-2 py-2 font-semibold text-slate-800">
                  {row.round}차
                </td>
                <td className="break-keep px-2 py-2 text-slate-700">{row.topic}</td>
                <td className="px-2 py-2 text-slate-700">
                  {formatDateRange(row.startAt, row.endAt)}
                </td>
                <td className="break-keep px-2 py-2 text-slate-700">{row.affiliation}</td>
                <td className="px-2 py-2 text-center font-semibold text-slate-800">
                  {row.count}명
                </td>
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
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5 + KAKAO_NOTICE_COLUMNS.length}
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
