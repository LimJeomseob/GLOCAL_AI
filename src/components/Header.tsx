import Link from "next/link";
import { PROGRAM_NAME } from "@/lib/constants";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-3 rounded"
          aria-label="경상국립대학교 글로컬 AI 동행 포털 홈으로 이동"
        >
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-bold text-white"
          >
            GNU
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-xs font-medium text-slate-500">
              경상국립대학교 글로컬대학30
            </span>
            <span className="text-sm font-bold text-brand sm:text-base">
              {PROGRAM_NAME}
            </span>
          </span>
        </Link>
      </div>
    </header>
  );
}
