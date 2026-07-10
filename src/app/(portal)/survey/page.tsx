"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SurveyForm } from "@/components/SurveyForm";
import { WORKSHOP_SEEDS } from "@/lib/constants";

function SurveyContent() {
  // 수료증 발급 완료 팝업 "만족도조사 참여하기"(/survey?round=N)로 진입 시 해당 회차를 자동 선택
  const searchParams = useSearchParams();
  const roundParam = Number(searchParams.get("round"));
  const initialRound = Number.isInteger(roundParam) && roundParam > 0 ? roundParam : undefined;

  return <SurveyForm workshopSeeds={WORKSHOP_SEEDS} initialRound={initialRound} />;
}

export default function SurveyPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-brand sm:text-2xl">만족도조사</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          특강에 참여해 주셔서 감사합니다. 보다 나은 프로그램 운영을 위해 소중한 의견을 남겨
          주세요.
        </p>
      </div>

      <Suspense>
        <SurveyContent />
      </Suspense>
    </div>
  );
}
