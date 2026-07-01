"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { AWARENESS_PATH_OPTIONS, SURVEY_LIKERT_QUESTIONS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { exportRowsAsCsv } from "@/lib/csv";
import { Button } from "@/components/ui/Button";
import type { SurveyResponse } from "@/lib/types";

const Q6_TRUNCATE_LENGTH = 40;

function Bar({ percent }: { percent: number }) {
  return (
    <div
      className="h-3 w-full overflow-hidden rounded-full bg-slate-100"
      role="presentation"
      aria-hidden="true"
    >
      <div
        className="h-full rounded-full bg-accent"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

function OpenAnswerCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > Q6_TRUNCATE_LENGTH;

  if (!text) {
    return <span className="text-slate-400">-</span>;
  }

  if (!isLong) {
    return <span>{text}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded((prev) => !prev)}
      title={expanded ? undefined : text}
      className="text-left underline decoration-dotted underline-offset-2 hover:text-brand"
      aria-expanded={expanded}
    >
      {expanded ? text : `${text.slice(0, Q6_TRUNCATE_LENGTH)}…`}
      <span className="sr-only">{expanded ? " (전체 답변 표시 중, 클릭하여 접기)" : " (클릭하여 전체 답변 보기)"}</span>
    </button>
  );
}

export function SurveyResultsView({
  initialResponses,
}: {
  initialResponses: SurveyResponse[];
}) {
  const [responses] = useState<SurveyResponse[]>(initialResponses);

  const total = responses.length;

  const awarenessStats = useMemo(() => {
    return AWARENESS_PATH_OPTIONS.map((option) => {
      const count = responses.filter((r) => r.awareness_path === option).length;
      const percent = total > 0 ? (count / total) * 100 : 0;
      return { option, count, percent };
    });
  }, [responses, total]);

  const likertStats = useMemo(() => {
    return SURVEY_LIKERT_QUESTIONS.map((q) => {
      const key = q.key as "q1" | "q2" | "q3" | "q4" | "q5";
      const values = responses.map((r) => r[key]).filter((v): v is number => typeof v === "number");
      const avg = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
      return { key, text: q.text, avg, count: values.length };
    });
  }, [responses]);

  const workshopStats = useMemo(() => {
    const map = new Map<string, number>();
    responses.forEach((r) => {
      map.set(r.workshop, (map.get(r.workshop) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([workshop, count]) => ({
        workshop,
        count,
        percent: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [responses, total]);

  function handleExportCsv() {
    exportRowsAsCsv(
      responses,
      [
        { header: "참여 프로그램", accessor: (r: SurveyResponse) => r.workshop },
        { header: "인지경로", accessor: (r: SurveyResponse) => r.awareness_path },
        { header: "Q1", accessor: (r: SurveyResponse) => r.q1 },
        { header: "Q2", accessor: (r: SurveyResponse) => r.q2 },
        { header: "Q3", accessor: (r: SurveyResponse) => r.q3 },
        { header: "Q4", accessor: (r: SurveyResponse) => r.q4 },
        { header: "Q5", accessor: (r: SurveyResponse) => r.q5 },
        { header: "개방형 답변(Q6)", accessor: (r: SurveyResponse) => r.q6 },
        { header: "제출일시", accessor: (r: SurveyResponse) => formatDateTime(r.submitted_at) },
      ],
      `LAWdata_원천데이터_${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-6">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-slate-600">총 응답 수</p>
            <p className="text-3xl font-bold text-brand">{total}건</p>
          </div>
          <Button type="button" variant="outline" onClick={handleExportCsv} disabled={total === 0}>
            LAWdata 원천 데이터 CSV 내보내기
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-6">
        <h2 className="text-base font-bold text-brand sm:text-lg">인지경로 분포</h2>
        <p className="mt-1 text-xs text-slate-500">
          응답자가 특강을 알게 된 경로별 응답 수와 비율입니다.
        </p>
        <ul className="mt-4 flex flex-col gap-3">
          {awarenessStats.map((stat) => (
            <li key={stat.option} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-slate-700">{stat.option}</span>
                <span className="whitespace-nowrap text-slate-600">
                  {stat.count}건 ({stat.percent.toFixed(1)}%)
                </span>
              </div>
              <Bar percent={stat.percent} />
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-6">
        <h2 className="text-base font-bold text-brand sm:text-lg">5점 척도 문항 평균</h2>
        <p className="mt-1 text-xs text-slate-500">문항별 평균 점수(5점 만점)입니다.</p>
        <ul className="mt-4 flex flex-col gap-4">
          {likertStats.map((stat, idx) => (
            <li key={stat.key} className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-2 text-sm">
                <span className="font-medium text-slate-700">
                  Q{idx + 1}. {stat.text}
                </span>
                <span className="whitespace-nowrap font-bold text-brand">
                  {stat.avg.toFixed(1)} / 5.0
                </span>
              </div>
              <Bar percent={(stat.avg / 5) * 100} />
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-6">
        <h2 className="text-base font-bold text-brand sm:text-lg">참여 프로그램별 응답 수</h2>
        <ul className="mt-4 flex flex-col gap-3">
          {workshopStats.map((stat) => (
            <li key={stat.workshop} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-slate-700">{stat.workshop}</span>
                <span className="whitespace-nowrap text-slate-600">
                  {stat.count}건 ({stat.percent.toFixed(1)}%)
                </span>
              </div>
              <Bar percent={stat.percent} />
            </li>
          ))}
          {workshopStats.length === 0 && (
            <li className="text-sm text-slate-500">아직 등록된 응답이 없습니다.</li>
          )}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-brand sm:text-lg">원천 데이터</h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card">
          <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
            <caption className="sr-only">만족도조사 원천 응답 데이터 테이블</caption>
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-3">
                  참여 프로그램
                </th>
                <th scope="col" className="px-3 py-3">
                  인지경로
                </th>
                <th scope="col" className="px-3 py-3">
                  Q1
                </th>
                <th scope="col" className="px-3 py-3">
                  Q2
                </th>
                <th scope="col" className="px-3 py-3">
                  Q3
                </th>
                <th scope="col" className="px-3 py-3">
                  Q4
                </th>
                <th scope="col" className="px-3 py-3">
                  Q5
                </th>
                <th scope="col" className="px-3 py-3">
                  개방형 답변(Q6)
                </th>
                <th scope="col" className="px-3 py-3">
                  제출일시
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {responses.map((r) => (
                <tr key={r.id} className={clsx("align-top")}>
                  <td className="px-3 py-3 text-slate-700">{r.workshop}</td>
                  <td className="px-3 py-3 text-slate-700">{r.awareness_path}</td>
                  <td className="px-3 py-3 text-slate-700">{r.q1}</td>
                  <td className="px-3 py-3 text-slate-700">{r.q2}</td>
                  <td className="px-3 py-3 text-slate-700">{r.q3}</td>
                  <td className="px-3 py-3 text-slate-700">{r.q4}</td>
                  <td className="px-3 py-3 text-slate-700">{r.q5}</td>
                  <td className="max-w-xs px-3 py-3 text-slate-700">
                    <OpenAnswerCell text={r.q6 ?? ""} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                    {formatDateTime(r.submitted_at)}
                  </td>
                </tr>
              ))}
              {responses.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-500">
                    아직 등록된 만족도조사 응답이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
