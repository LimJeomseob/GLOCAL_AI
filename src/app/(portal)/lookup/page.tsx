import { LookupForm } from "@/components/LookupForm";

export default function LookupPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-brand sm:text-2xl">신청내역조회</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          신청 시 입력하신 성명과 연락처로 신청 내역을 조회할 수 있습니다.
        </p>
      </div>

      <LookupForm />
    </div>
  );
}
