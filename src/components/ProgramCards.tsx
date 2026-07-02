"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  INSTRUCTORS,
  WORKSHOP_SEEDS,
  type InstructorProfile,
  type WorkshopSeed,
} from "@/lib/constants";
import { formatDateRange } from "@/lib/format";
import { InstructorModal } from "@/components/InstructorModal";
import { Button } from "@/components/ui/Button";

const LEVEL_BADGE_CLASSES: Record<string, string> = {
  초급: "bg-sky-100 text-sky-700",
  중급: "bg-amber-100 text-amber-700",
  고급: "bg-red-100 text-red-700",
};

/**
 * 소개 탭 「프로그램 안내」 카드 그리드.
 * - 강사명 클릭 → 프로필 팝업(InstructorModal)
 * - 신청 바로가기 → /apply?round=N (신청 탭에서 해당 회차 자동 선택)
 */
export function ProgramCards() {
  const [selectedInstructor, setSelectedInstructor] = useState<InstructorProfile | null>(null);
  // 마감 판정은 마운트 후 클라이언트 시각으로만 계산(빌드 시점 고정·하이드레이션 불일치 방지)
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  function openInstructor(name: string) {
    const profile = INSTRUCTORS.find((i) => i.name === name) ?? null;
    setSelectedInstructor(profile);
  }

  return (
    <>
      <ul role="list" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {WORKSHOP_SEEDS.map((w) => (
          <ProgramCard
            key={w.round}
            workshop={w}
            isClosed={now !== null && now > new Date(w.deadline).getTime()}
            onOpenInstructor={openInstructor}
          />
        ))}
      </ul>
      <InstructorModal
        instructor={selectedInstructor}
        onClose={() => setSelectedInstructor(null)}
      />
    </>
  );
}

function ProgramCard({
  workshop: w,
  isClosed,
  onOpenInstructor,
}: {
  workshop: WorkshopSeed;
  isClosed: boolean;
  onOpenInstructor: (name: string) => void;
}) {
  return (
    <li className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span
          className={clsx(
            "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold",
            LEVEL_BADGE_CLASSES[w.level] ?? "bg-slate-100 text-slate-600"
          )}
        >
          {w.level}
        </span>
        <span
          className={clsx(
            "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold",
            isClosed ? "bg-slate-800 text-white" : "bg-emerald-100 text-emerald-700"
          )}
        >
          {isClosed ? "마감" : "모집중"}
        </span>
      </div>

      <h3 className="mt-3 text-base font-bold leading-snug text-slate-900">
        {w.round}차 · {w.topicSummary}
      </h3>

      <ul role="list" className="mt-3 flex flex-col gap-1.5 text-sm text-slate-700">
        <li>
          <span className="font-semibold">• 강사: </span>
          <button
            type="button"
            onClick={() => onOpenInstructor(w.instructor)}
            aria-label={`${w.instructor} 강사 프로필 보기`}
            className="font-semibold text-accent underline underline-offset-2 hover:text-brand"
          >
            {w.instructor}
          </button>
        </li>
        <li>
          <span className="font-semibold">• 주제: </span>
          {w.topicSummary}
        </li>
        <li>
          <span className="font-semibold">• 세부내용:</span>
          <ul role="list" className="mt-1 flex flex-col gap-1.5 pl-3">
            {w.sessions.map((s) => (
              <li key={s.time_label}>
                <p className="text-sm text-slate-700">- {s.topic}</p>
                <p className="pl-2.5 text-xs text-slate-500">{s.content}</p>
              </li>
            ))}
          </ul>
        </li>
      </ul>

      {w.notes && (
        <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
          <span className="font-bold">협조사항</span> {w.notes}
        </p>
      )}

      <dl className="mt-4 flex flex-col gap-1.5 border-t border-slate-100 pt-3 text-sm text-slate-600">
        <div className="flex gap-2">
          <dt aria-label="일시" className="shrink-0">
            📅
          </dt>
          <dd>{formatDateRange(w.startAt, w.endAt)}</dd>
        </div>
        <div className="flex gap-2">
          <dt aria-label="장소" className="shrink-0">
            📍
          </dt>
          <dd>{w.location}</dd>
        </div>
        <div className="flex gap-2">
          <dt aria-label="정원" className="shrink-0">
            👥
          </dt>
          <dd>정원 {w.capacity}명</dd>
        </div>
      </dl>

      <div className="mt-4 flex-1" aria-hidden="true" />

      {isClosed ? (
        <Button type="button" disabled className="w-full">
          신청 마감
        </Button>
      ) : (
        <Link
          href={`/apply?round=${w.round}`}
          className="inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand sm:text-base"
        >
          신청 바로가기
        </Link>
      )}
    </li>
  );
}
