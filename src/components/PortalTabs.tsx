"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/", label: "소개" },
  { href: "/apply", label: "신청" },
  { href: "/lookup", label: "신청내역조회" },
  { href: "/survey", label: "만족도조사" },
  { href: "/certificate", label: "수료증 발급" },
];

export function PortalTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="신청 포털 탭 메뉴"
      className="border-b border-slate-200 bg-white"
    >
      <ul className="mx-auto flex max-w-5xl overflow-x-auto px-2 sm:px-6" role="list">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
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
