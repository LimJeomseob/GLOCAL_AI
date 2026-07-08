"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const ADMIN_TABS = [
  { href: "/admin/applicants", label: "신청자 관리" },
  { href: "/admin/survey", label: "만족도 설문결과" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="관리자 포털 탭 메뉴" className="border-b border-slate-200 bg-white">
      <ul className="mx-auto flex max-w-[1600px] overflow-x-auto px-2 sm:px-6" role="list">
        {ADMIN_TABS.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={clsx(
                  "block whitespace-nowrap border-b-[3px] px-4 py-3 text-sm font-semibold transition-colors sm:text-base",
                  isActive
                    ? "border-accent text-brand"
                    : "border-transparent text-slate-500 hover:text-brand"
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
