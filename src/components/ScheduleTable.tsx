import { WORKSHOP_SEEDS } from "@/lib/constants";
import { formatDateRange } from "@/lib/format";

/** 회차별 일정표(PRD §13.1, §13.2). 모바일: 카드형 / 데스크톱(md~): 표 형태 */
export function ScheduleTable() {
  return (
    <div>
      {/* 모바일: 카드형 */}
      <ul className="flex flex-col gap-4 md:hidden" role="list">
        {WORKSHOP_SEEDS.map((w) => (
          <li
            key={w.round}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full bg-brand px-3 py-1 text-xs font-bold text-white">
                {w.round}차
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {w.level} · {w.target}
              </span>
            </div>
            <h3 className="mt-3 text-base font-bold text-slate-900">{w.topicSummary}</h3>
            <dl className="mt-3 flex flex-col gap-1.5 text-sm text-slate-600">
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 font-semibold text-slate-800">일시</dt>
                <dd>{formatDateRange(w.startAt, w.endAt)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 font-semibold text-slate-800">장소</dt>
                <dd>{w.location}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 font-semibold text-slate-800">정원</dt>
                <dd>{w.capacity}명</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 font-semibold text-slate-800">강사</dt>
                <dd>{w.instructor}</dd>
              </div>
            </dl>

            <ol className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3" role="list">
              {w.sessions.map((s) => (
                <li key={s.time_label}>
                  <p className="text-xs font-bold text-accent">{s.time_label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-800">{s.topic}</p>
                  <p className="mt-0.5 text-sm text-slate-600">{s.content}</p>
                </li>
              ))}
            </ol>

            {w.notes && (
              <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                <span className="font-bold">협조사항</span> {w.notes}
              </p>
            )}
          </li>
        ))}
      </ul>

      {/* 데스크톱: 표 형태 */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card md:block">
        <table className="w-full min-w-[840px] border-collapse text-left text-sm">
          <caption className="sr-only">
            회차별 일정표: 회차, 일시, 장소, 정원, 수준/대상, 강사, 세부 강의내용, 협조사항
          </caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
              <th scope="col" className="px-4 py-3 font-semibold">
                회차
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                일시
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                장소
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                정원
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                수준/대상
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                강사
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                세부 강의내용(2세션)
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                협조사항
              </th>
            </tr>
          </thead>
          <tbody>
            {WORKSHOP_SEEDS.map((w) => (
              <tr key={w.round} className="border-b border-slate-100 align-top last:border-0">
                <th scope="row" className="px-4 py-4 font-bold text-brand">
                  {w.round}차
                  <p className="mt-1 text-xs font-normal text-slate-500">{w.topicSummary}</p>
                </th>
                <td className="px-4 py-4 text-slate-600">{formatDateRange(w.startAt, w.endAt)}</td>
                <td className="px-4 py-4 text-slate-600">{w.location}</td>
                <td className="px-4 py-4 text-slate-600">{w.capacity}명</td>
                <td className="px-4 py-4 text-slate-600">
                  {w.level} / {w.target}
                </td>
                <td className="px-4 py-4 text-slate-600">{w.instructor}</td>
                <td className="px-4 py-4 text-slate-600">
                  <ol className="flex flex-col gap-2" role="list">
                    {w.sessions.map((s) => (
                      <li key={s.time_label}>
                        <p className="text-xs font-bold text-accent">{s.time_label}</p>
                        <p className="font-semibold text-slate-800">{s.topic}</p>
                        <p className="text-xs text-slate-500">{s.content}</p>
                      </li>
                    ))}
                  </ol>
                </td>
                <td className="px-4 py-4 text-xs text-slate-500">{w.notes || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
