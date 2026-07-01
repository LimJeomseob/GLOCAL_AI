"use client";

import { useState } from "react";
import { INSTRUCTORS, type InstructorProfile } from "@/lib/constants";
import { InstructorModal } from "@/components/InstructorModal";

/** 강사 이니셜(성) 추출 — 실제 프로필 사진 파일이 없으므로 아바타로 대체 */
function getInitial(name: string): string {
  return name.slice(0, 1);
}

/** 강사 카드 그리드 + 클릭 시 상세 프로필 모달을 여는 상태관리를 함께 담당 */
export function InstructorCardGrid() {
  const [selected, setSelected] = useState<InstructorProfile | null>(null);

  return (
    <>
      <ul
        role="list"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {INSTRUCTORS.map((instructor) => (
          <li key={instructor.slug}>
            <InstructorCard instructor={instructor} onOpen={setSelected} />
          </li>
        ))}
      </ul>
      <InstructorModal instructor={selected} onClose={() => setSelected(null)} />
    </>
  );
}

interface InstructorCardProps {
  instructor: InstructorProfile;
  onOpen: (instructor: InstructorProfile) => void;
}

function InstructorCard({ instructor, onOpen }: InstructorCardProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(instructor)}
      className="flex w-full flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-card transition-transform hover:-translate-y-0.5 hover:shadow-lg focus-visible:-translate-y-0.5"
    >
      <span
        aria-hidden="true"
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand text-xl font-bold text-white"
      >
        {getInitial(instructor.name)}
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-base font-bold text-slate-900">{instructor.name}</span>
        <span className="text-xs font-medium text-accent">
          {instructor.rounds.map((r) => `${r}차`).join(", ")} 담당
        </span>
        <span className="text-sm text-slate-600">{instructor.tagline}</span>
      </span>
      <span className="mt-1 text-xs font-semibold text-brand underline underline-offset-2">
        프로필 자세히 보기
      </span>
    </button>
  );
}
