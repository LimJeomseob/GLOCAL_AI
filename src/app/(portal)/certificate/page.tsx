import { CertificateIssueForm } from "@/components/CertificateIssueForm";

export default function CertificatePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-brand sm:text-2xl">수료증 발급</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          신청 시 입력하신 성명과 연락처로 본인확인 후, 이수 완료된 프로그램의 수료증을 PDF로
          발급받을 수 있습니다.
        </p>
      </div>
      <CertificateIssueForm />
    </div>
  );
}
