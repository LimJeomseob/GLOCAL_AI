"use client";

import { useId } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { LookupResultItem } from "@/lib/types";

interface CancelConfirmModalProps {
  open: boolean;
  item: LookupResultItem | null;
  onConfirm: () => void;
  onClose: () => void;
}

/** 신청 취소 확인 팝업. 접근성/포커스트랩/ESC/배경클릭 닫힘은 ui/Modal.tsx가 담당 */
export function CancelConfirmModal({ open, item, onConfirm, onClose }: CancelConfirmModalProps) {
  const titleId = useId();

  return (
    <Modal open={open} onClose={onClose} titleId={titleId}>
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-xl font-bold text-slate-900">
            신청 취소 확인
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

        {item && (
          <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
            {item.roundLabel || `${item.round}차`} · {item.topic}
          </p>
        )}

        <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
          해당 특강 신청을 취소하시겠습니까? 다시 참여를 원하시면 신청 탭에서 재신청해야 하며,
          정원 마감 시 재신청이 제한될 수 있습니다.
        </p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} className="sm:w-auto">
            돌아가기
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} className="sm:w-auto">
            신청 취소
          </Button>
        </div>
      </div>
    </Modal>
  );
}
