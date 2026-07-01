import { SurveyForm } from "@/components/SurveyForm";
import { WORKSHOP_SEEDS } from "@/lib/constants";

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

      <SurveyForm workshopSeeds={WORKSHOP_SEEDS} />
    </div>
  );
}
