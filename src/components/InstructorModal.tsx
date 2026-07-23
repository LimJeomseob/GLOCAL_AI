"use client";

import { useId } from "react";
import { Modal } from "@/components/ui/Modal";
import type { InstructorProfile } from "@/lib/constants";

interface InstructorModalProps {
  instructor: InstructorProfile | null;
  onClose: () => void;
}

function getInitial(name: string): string {
  return name.slice(0, 1);
}

/** 강사 프로필 상세 팝업. 접근성/포커스트랩/ESC/배경클릭 닫힘은 ui/Modal.tsx가 담당 */
export function InstructorModal({ instructor, onClose }: InstructorModalProps) {
  const titleId = useId();

  return (
    <Modal open={!!instructor} onClose={onClose} titleId={titleId}>
      {instructor && (
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-white"
              >
                {getInitial(instructor.name)}
              </span>
              <div>
                <h2 id={titleId} className="text-xl font-bold text-slate-900">
                  {instructor.name}
                </h2>
                {instructor.tagline && (
                  <p className="mt-0.5 text-sm text-accent">{instructor.tagline}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <span aria-hidden="true" className="text-xl leading-none">
                &times;
              </span>
            </button>
          </div>

          <dl className="flex flex-col gap-4 text-sm">
            {instructor.affiliation && (
              <div>
                <dt className="font-semibold text-slate-800">소속</dt>
                <dd className="mt-0.5 text-slate-600">{instructor.affiliation}</dd>
              </div>
            )}

            {instructor.education && (
              <div>
                <dt className="font-semibold text-slate-800">학력</dt>
                <dd className="mt-0.5 text-slate-600">{instructor.education}</dd>
              </div>
            )}

            {instructor.career.length > 0 && (
              <div>
                <dt className="font-semibold text-slate-800">주요 경력</dt>
                <dd className="mt-1">
                  <ul className="flex flex-col gap-1 text-slate-600">
                    {instructor.career.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span aria-hidden="true">·</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}

            {instructor.lectures && instructor.lectures.length > 0 && (
              <div>
                <dt className="font-semibold text-slate-800">강의 이력</dt>
                <dd className="mt-1">
                  <ul className="flex flex-col gap-1 text-slate-600">
                    {instructor.lectures.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span aria-hidden="true">·</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}

            {instructor.awards && instructor.awards.length > 0 && (
              <div>
                <dt className="font-semibold text-slate-800">수상 이력</dt>
                <dd className="mt-1">
                  <ul className="flex flex-col gap-1 text-slate-600">
                    {instructor.awards.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span aria-hidden="true">·</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}

            {instructor.publications && instructor.publications.length > 0 && (
              <div>
                <dt className="font-semibold text-slate-800">저서·발간물</dt>
                <dd className="mt-1">
                  <ul className="flex flex-col gap-1 text-slate-600">
                    {instructor.publications.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span aria-hidden="true">·</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}

            <div className="rounded-lg bg-brand/5 p-3">
              <dt className="font-semibold text-brand">담당 회차</dt>
              <dd className="mt-0.5 text-slate-700">{instructor.assignment}</dd>
            </div>
          </dl>
        </div>
      )}
    </Modal>
  );
}
