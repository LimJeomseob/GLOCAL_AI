"use client";

import { useId } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface SurveyPromptModalProps {
  open: boolean;
  round?: number;
  onClose: () => void;
}

/** 수료증 발급 직후 만족도조사 참여를 안내하는 팝업. 접근성/포커스트랩/ESC/배경클릭 닫힘은 ui/Modal.tsx가 담당 */
export function SurveyPromptModal({ open, round, onClose }: SurveyPromptModalProps) {
  const titleId = useId();
  const surveyHref = round ? `/survey?round=${round}` : "/survey";

  return (
    <Modal open={open} onClose={onClose} titleId={titleId}>
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-xl font-bold text-slate-900">
            만족도조사 참여 안내
          </h2>
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

        <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
          수료증이 정상적으로 발급되었습니다. 보다 나은 프로그램 운영을 위해 만족도조사에 참여해
          주시면 큰 도움이 됩니다.
        </p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} className="sm:w-auto">
            다음에 할게요
          </Button>
          <Link
            href={surveyHref}
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand sm:w-auto sm:text-base"
          >
            만족도조사 참여하기
          </Link>
        </div>
      </div>
    </Modal>
  );
}
