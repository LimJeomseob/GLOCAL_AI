import type { Metadata } from "next";
import { APPLICATION_OPEN_AT, PROGRAM_NAME, WORKSHOP_SEEDS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { InstructorCardGrid } from "@/components/InstructorCard";
import { ScheduleTable } from "@/components/ScheduleTable";

export const metadata: Metadata = {
  title: `소개 | ${PROGRAM_NAME}`,
};

const CAPABILITIES = [
  {
    title: "워크플로우 자동화",
    description:
      "제미나이·Google Workspace 연동으로 반복 업무를 자동화하고, 문서·시트·메일 처리 흐름을 스스로 설계할 수 있습니다.",
  },
  {
    title: "바이브코딩 & 실무 스크립트 제작",
    description:
      "프롬프트만으로 데이터 처리·문서 작업용 스크립트와 공공 실무용 웹페이지·업무 도구를 만드는 방법을 익힙니다.",
  },
  {
    title: "프롬프트 엔지니어링",
    description:
      "한국어 기반 프롬프트 구조와 출력 포맷 설계를 통해 생성형 AI 결과물의 정확도와 활용도를 높입니다.",
  },
  {
    title: "문서·데이터 자동화 및 MCP 연동",
    description:
      "이미지·엑셀·한글(hwp) 문서 자동 작성, 데이터 분석·보고서 자동화, MCP 기반 외부 도구 연동까지 실무에 바로 적용합니다.",
  },
];

const LOCATIONS = Array.from(new Set(WORKSHOP_SEEDS.map((w) => w.location)));

export default function PortalIntroPage() {
  return (
    <div className="flex flex-col gap-16">
      {/* 히어로: 프로그램 소개 */}
      <section aria-labelledby="hero-heading" className="text-center">
        <p className="text-sm font-semibold text-accent">
          경상국립대학교 글로컬대학30 · 2026학년도 「모두의 AI를 위한 7월 AI활용 특강」
        </p>
        <h1 id="hero-heading" className="mt-2 text-2xl font-extrabold text-brand sm:text-3xl">
          {PROGRAM_NAME}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-600 sm:text-base">
          생성형 AI를 활용해 업무 자동화, 문서·데이터 처리, 프롬프트 설계 역량을 키우는 실무
          중심 특강입니다. 교직원, 재학생, 지역민 누구나 참여할 수 있습니다.
        </p>

        <dl className="mx-auto mt-8 grid max-w-4xl grid-cols-1 gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <dt className="text-xs font-semibold text-slate-500">신청기간</dt>
            <dd className="mt-1 text-base font-bold text-slate-900">
              {formatDateTime(APPLICATION_OPEN_AT)}부터
            </dd>
            <dd className="mt-1 text-sm text-slate-500">
              각 회차 시작 2일 전 자동 마감(회차별 마감일은 일정표 참고)
            </dd>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <dt className="text-xs font-semibold text-slate-500">신청 대상</dt>
            <dd className="mt-1 text-base font-bold text-slate-900">
              교직원 · 재학생 · 지역민
            </dd>
            <dd className="mt-1 text-sm text-slate-500">회차별 권장 대상은 상이할 수 있음</dd>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <dt className="text-xs font-semibold text-slate-500">장소</dt>
            <dd className="mt-1 text-base font-bold text-slate-900">
              {LOCATIONS.map((loc) => (
                <span key={loc} className="block">
                  {loc}
                </span>
              ))}
            </dd>
            <dd className="mt-2 text-sm">
              <a
                href="https://naver.me/5chMgpBo"
                target="_blank"
                rel="noreferrer noopener"
                className="font-semibold text-accent underline underline-offset-2"
              >
                네이버 지도에서 위치 보기
              </a>
            </dd>
          </div>
        </dl>
      </section>

      {/* 역량 안내 */}
      <section aria-labelledby="capability-heading">
        <h2 id="capability-heading" className="text-xl font-bold text-slate-900 sm:text-2xl">
          특강을 통해 얻는 역량
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          실습 중심 커리큘럼을 통해 아래와 같은 실무 역량을 갖출 수 있습니다.
        </p>
        <ul role="list" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <li
              key={c.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"
            >
              <h3 className="text-base font-bold text-brand">{c.title}</h3>
              <p className="mt-1.5 text-sm text-slate-600">{c.description}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 강사 소개 */}
      <section aria-labelledby="instructor-heading">
        <h2 id="instructor-heading" className="text-xl font-bold text-slate-900 sm:text-2xl">
          강사 소개
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          카드를 클릭(또는 Enter/Space)하면 강사의 상세 프로필을 확인할 수 있습니다.
        </p>
        <div className="mt-6">
          <InstructorCardGrid />
        </div>
      </section>

      {/* 회차별 일정표 */}
      <section aria-labelledby="schedule-heading">
        <h2 id="schedule-heading" className="text-xl font-bold text-slate-900 sm:text-2xl">
          회차별 일정표
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          회차, 일시, 장소, 정원, 수준/대상, 강사와 2세션 상세 강의내용, 협조사항을 확인하세요.
        </p>
        <div className="mt-6">
          <ScheduleTable />
        </div>
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          <strong className="font-bold">안내</strong> 각 회차 시작 2일 전 자동 마감됩니다. 신청을
          원하시면 마감 전에 서둘러 신청해 주세요.
        </p>
      </section>
    </div>
  );
}
