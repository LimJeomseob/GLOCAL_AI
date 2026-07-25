import {
  CONTACT_EMAIL,
  CONTACT_PHONE,
  ORG_NAME,
  ORGANIZER_NAME,
  PROGRAM_NAME,
} from "@/lib/constants";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-slate-500 sm:px-6">
        <p className="font-semibold text-slate-700">{ORG_NAME} 글로컬대학30 사업단</p>
        <p className="mt-1">
          2026학년도 「모두의 AI를 위한 7~8월 AI활용 특강」 · {PROGRAM_NAME}
        </p>
        <p className="mt-1">주관: {ORGANIZER_NAME}</p>
        <p className="mt-1">
          문의: {CONTACT_PHONE}, {CONTACT_EMAIL}
        </p>
        <p className="mt-1">
          수집된 개인정보는 특강 신청·운영·수료증 발급 목적에만 사용되며, 운영 종료 후 관계
          법령에 따라 보관 후 파기됩니다.
        </p>
      </div>
    </footer>
  );
}
