import type { WorkshopLevel, WorkshopSession } from "./types";

export const PROGRAM_NAME = "일과 삶을 바꾸는 생성형 AI 실무과정";
export const PROGRAM_FULL_TITLE =
  "모두의 AI를 위한 7월 AI활용 특강 — 일과 삶을 바꾸는 생성형 AI 실무과정";
export const ISSUER_NAME = "경상국립대학교 AI융합원장";
export const ORG_NAME = "경상국립대학교";
export const ORGANIZER_NAME = "경상국립대학교 AI 융합원";

export const APPLICATION_OPEN_AT = "2026-07-08T09:00:00+09:00";

export const BRAND_COLORS = {
  primary: "#003876",
  secondary: "#0B4DA2",
};

/** workshops 테이블 seed 데이터 원본 (PRD §13.1, §13.2, §13.3) — supabase/migrations seed와 동일하게 유지 */
export interface WorkshopSeed {
  round: number;
  topicSummary: string;
  instructor: string;
  location: string;
  capacity: number;
  startAt: string;
  endAt: string;
  deadline: string;
  applyOpenAt: string;
  level: WorkshopLevel;
  target: string;
  sessions: WorkshopSession[];
  notes: string;
}

export const WORKSHOP_SEEDS: WorkshopSeed[] = [
  {
    round: 1,
    topicSummary: "제미나이 워크플로우 자동화 · Google Workspace 실습",
    instructor: "이성원",
    location: "경상국립대학교 4동 학술정보관 하이플렉스강의실",
    capacity: 30,
    startAt: "2026-07-22T13:30:00+09:00",
    endAt: "2026-07-22T17:30:00+09:00",
    deadline: "2026-07-20T13:00:00+09:00",
    applyOpenAt: APPLICATION_OPEN_AT,
    level: "초급",
    target: "전체",
    sessions: [
      {
        time_label: "13:00~15:00",
        topic: "제미나이를 이용한 워크플로우 자동화",
        content:
          "Google Gemini 작동 원리 이해 및 프롬프트 기반 반복 업무 자동화(워크플로우) 설계 개념 학습",
      },
      {
        time_label: "15:00~17:00",
        topic: "Google Workspace 활용 워크플로우(실습)",
        content:
          "Google Workspace(문서·시트·메일) 연동을 통한 반복 업무 자동화 흐름 구성 및 실무 적용 실습",
      },
    ],
    notes: "",
  },
  {
    round: 2,
    topicSummary: "바이브코딩 이해 · 자연어 업무 자동화 스크립트",
    instructor: "박용규",
    location: "경상국립대학교 4동 학술정보관 하이플렉스강의실",
    capacity: 30,
    startAt: "2026-07-24T13:30:00+09:00",
    endAt: "2026-07-24T17:00:00+09:00",
    deadline: "2026-07-22T13:00:00+09:00",
    applyOpenAt: APPLICATION_OPEN_AT,
    level: "중급",
    target: "공공기관 실무자",
    sessions: [
      {
        time_label: "13:00~15:00",
        topic: "바이브코딩에 대한 이해",
        content:
          "바이브코딩 개념과 AI 코딩도구(클로드 코드 등) 입문, 공공 실무 문서·데이터 처리 자동화 이해",
      },
      {
        time_label: "15:00~17:00",
        topic: "자연어로 만드는 업무 자동화 스크립트",
        content:
          "① 프롬프트만으로 데이터 처리·문서 작업용 스크립트 생성 실습 ② 공공 실무용 웹페이지·업무 도구 제작 실습",
      },
    ],
    notes: "개인별 파일 지참(USB) 및 Claude Pro 이상 유료버전 사용 권장",
  },
  {
    round: 3,
    topicSummary: "효과적인 프롬프트 작성법(온라인)",
    instructor: "강수진",
    location: "온라인(실시간 Zoom)",
    capacity: 100,
    startAt: "2026-07-29T14:00:00+09:00",
    endAt: "2026-07-29T16:00:00+09:00",
    deadline: "2026-07-27T14:00:00+09:00",
    applyOpenAt: APPLICATION_OPEN_AT,
    level: "초급",
    target: "전체",
    sessions: [
      {
        time_label: "14:00~16:00",
        topic: "효과적인 프롬프트 작성법(온라인)",
        content:
          "① 프롬프트 구조와 출력 포맷 설계로 결과 정확도 향상 ② 생성형 AI 플랫폼 기반 PPT·문서 등 콘텐츠 프롬프트 시연",
      },
    ],
    notes: "원활한 강사 상호작용을 위해 카메라·마이크 사용 권장",
  },
  {
    round: 4,
    topicSummary: "Claude 데스크탑 파일 자동화 · 한글(hwp) 문서 자동 작성",
    instructor: "임근석",
    location: "경상국립대학교 4동 학술정보관 하이플렉스강의실",
    capacity: 30,
    startAt: "2026-07-31T13:00:00+09:00",
    endAt: "2026-07-31T17:00:00+09:00",
    deadline: "2026-07-29T13:00:00+09:00",
    applyOpenAt: APPLICATION_OPEN_AT,
    level: "중급",
    target: "전체",
    sessions: [
      {
        time_label: "13:00~15:00",
        topic: "Claude 데스크탑 앱 설치와 파일 정리 자동화",
        content: "클로드 데스크탑 앱 설치 및 파일·폴더 자동 정리 기능 활용법",
      },
      {
        time_label: "15:00~17:00",
        topic: "한글(hwp) 스킬을 활용한 문서 자동 작성",
        content:
          "① 영수증 사진 등 이미지 데이터를 엑셀로 자동 정리 실습 ② hwp 스킬로 클로드를 통한 한글 파일 자동 생성 실습",
      },
    ],
    notes: "개인별 파일 지참(USB) 및 Claude Pro 이상 유료버전 사용 권장",
  },
  {
    round: 5,
    topicSummary: "데이터 분석·보고서 자동화 · MCP 기반 도구 연동",
    instructor: "박용규",
    location: "경상국립대학교 4동 학술정보관 하이플렉스강의실",
    capacity: 30,
    startAt: "2026-08-07T13:00:00+09:00",
    endAt: "2026-08-07T17:00:00+09:00",
    deadline: "2026-08-05T13:00:00+09:00",
    applyOpenAt: APPLICATION_OPEN_AT,
    level: "고급",
    target: "공공기관 실무자",
    sessions: [
      {
        time_label: "13:00~15:00",
        topic: "데이터 분석·보고서 생성 자동화",
        content: "데이터 분석 및 보고서 생성 등 공공 업무 자동화 파이프라인 구축",
      },
      {
        time_label: "15:00~17:00",
        topic: "MCP 기반 도구 연동·협업 자동화",
        content:
          "MCP(Model Context Protocol)를 활용한 외부 도구·데이터 연동 업무 자동화(심화)",
      },
    ],
    notes: "개인별 파일 지참(USB) 및 Claude Pro 이상 유료버전 사용 권장",
  },
];

export const TOTAL_CAPACITY = WORKSHOP_SEEDS.reduce((sum, w) => sum + w.capacity, 0); // 220

export interface InstructorProfile {
  slug: string;
  name: string;
  tagline: string;
  affiliation: string;
  rounds: number[];
  education?: string;
  career: string[];
  awards?: string[];
  publications?: string[];
  assignment: string;
  photoAlt: string;
}

/** 소개 탭 강사 카드 · 팝업 콘텐츠 (PRD §14) */
export const INSTRUCTORS: InstructorProfile[] = [
  {
    slug: "lee-seongwon",
    name: "이성원",
    tagline: "교육 현장의 생성형 AI 실천가 · Google 공인 트레이너",
    affiliation: "영산중학교 교사",
    rounds: [1],
    education: "경남대학교 AI창의융합교육 석사, 교육학 석사",
    career: [
      "Google for Education 구글 공인 트레이너",
      "'Gemini Academy Teacher Trainer' 위촉",
      "서울대학교 AIEDAP 마스터교원",
      "경상국립대학교 영재교육 담당교원 직무연수(생성형 AI) 강사",
    ],
    awards: [
      "2025 한국관광공사 Prompthon 서비스 비전 우수상",
      "2024 Wanted×NaverCloud Prompthon 특별상",
      "2023 엘리스 AI Edu Hackathon 대상",
      "2023 SKT·OpenAI Prompter Day Seoul 예선 통과",
    ],
    assignment: "본 특강 1차(제미나이 워크플로우 자동화 · Google Workspace 실습) 담당",
    photoAlt: "이성원 강사 프로필 사진",
  },
  {
    slug: "park-yonggyu",
    name: "박용규",
    tagline: "공공 실무 중심의 바이브코딩·업무자동화 강사",
    affiliation: "바이브코딩 · 업무자동화 전문 강사",
    rounds: [2, 5],
    career: [
      "전) 국회 보좌관",
      "바이브코딩(클로드 코드 등) 강의",
      "자연어 업무 자동화 스크립트 강의",
      "데이터 분석·보고서 자동화 강의",
      "MCP 기반 도구 연동 강의",
    ],
    assignment:
      "본 특강 2차(바이브코딩 이해 · 자연어 업무 자동화 스크립트), 5차(데이터 분석·보고서 자동화 · MCP 기반 도구 연동) 담당",
    photoAlt: "박용규 강사 프로필 사진",
  },
  {
    slug: "kang-sujin",
    name: "강수진",
    tagline: "국내 1호 프롬프트 엔지니어",
    affiliation: "더프롬프트컴퍼니 대표 (前 뤼튼테크놀로지스 프롬프트 엔지니어)",
    rounds: [3],
    education: "University of Hawaii at Manoa 한국어학 박사(대화 분석·상호작용 언어학)",
    career: [
      "저서 「지적 대화를 위한 AI 언어 수업: 생각을 확장하는 프롬프트의 기술」",
      "성균관대학교 영상학과 겸임교수",
      "저서 「프롬프트 엔지니어의 업무일지」",
      "유튜브 '프롬수진' 운영",
      "생성형 AI·프롬프트 엔지니어링 기업 강연·교육 다수",
      "프롬프트 기획·제작·테스트·평가 방법론 강의",
    ],
    assignment: "본 특강 3차(효과적인 프롬프트 작성법 · 온라인) 담당",
    photoAlt: "강수진 강사 프로필 사진",
  },
  {
    slug: "lim-geunseok",
    name: "임근석",
    tagline: "실전형 Trendy AI 코치(Mineru) · #VibeCoding #AgentAI",
    affiliation: "쓸모랩 대표, 우리기획 AI 엔지니어(팀장)",
    rounds: [4],
    career: [
      "국내 1호 프롬프트 엔지니어 커뮤니티·n8n Korea·AI 프론티어 운영진",
      "온라인 강의 'n8n으로 시작하는 노코드 AI 자동화'",
      "100주 연속 블로그 발행",
      "클로드 코드 Deep Dive 및 기업/대학 다수 강의(카카오·부산대·인하공전 등)",
    ],
    assignment:
      "본 특강 4차(Claude 데스크탑 앱 설치·파일 정리 자동화 · 한글(hwp) 문서 자동 작성) 담당",
    photoAlt: "임근석 강사 프로필 사진",
  },
];

/** 만족도조사 탭 - 인지경로 6지선다 (§5.4) */
export const AWARENESS_PATH_OPTIONS = [
  "학과/부서 공지(공문·게시판)",
  "대학 홈페이지/포털 공지",
  "문자·카카오톡 안내",
  "SNS(인스타그램·페이스북 등)",
  "지인·동료 추천",
  "기타",
];

/** 만족도조사 탭 - 5점 척도 5문항 (§5.4) */
export const SURVEY_LIKERT_QUESTIONS = [
  { key: "q1", required: true, text: "특강 내용은 사전 안내된 목적·주제에 부합하였다." },
  { key: "q2", required: true, text: "특강 운영(진행 방식, 시간 배분)은 적절하였다." },
  { key: "q3", required: true, text: "강사의 전달력 및 전문성은 우수하였다." },
  { key: "q4", required: true, text: "특강 내용을 실무(업무)에 적용할 수 있다고 생각한다." },
  { key: "q5", required: true, text: "향후 유사한 특강이 있다면 참여(추천)할 의향이 있다." },
] as const;

export const LIKERT_SCALE_LABELS = [
  "1점(전혀 그렇지 않다)",
  "2점(그렇지 않다)",
  "3점(보통이다)",
  "4점(그렇다)",
  "5점(매우 그렇다)",
];

/** 카카오톡 안내문자 템플릿(설계용, §9.3) */
export interface KakaoTemplateSpec {
  type: "1" | "2" | "3";
  name: string;
  description: string;
  variables: string[];
  sampleBody: string;
}

export const KAKAO_TEMPLATES: KakaoTemplateSpec[] = [
  {
    type: "1",
    name: "신청결과 안내",
    description: "신청 상태 확정 시(승인/대기/취소) 발송",
    variables: ["성명", "프로그램명", "회차", "상태", "일시", "장소"],
    sampleBody:
      "[{프로그램명}] {성명}님, {회차} 신청이 {상태} 처리되었습니다.\n일시: {일시}\n장소: {장소}",
  },
  {
    type: "2",
    name: "프로그램별 참여 유의사항",
    description:
      "회차별 준비물·주의 안내(2·4·5차: USB 파일 지참·Claude Pro 이상 유료버전 권장 / 3차: 카메라·마이크 사용 권장)",
    variables: ["성명", "프로그램명", "유의사항"],
    sampleBody: "[{프로그램명}] {성명}님, 참여 전 아래 유의사항을 확인해 주세요.\n{유의사항}",
  },
  {
    type: "3",
    name: "프로그램 안내",
    description: "장소·시간·간략 내용 안내",
    variables: ["성명", "프로그램명", "일시", "장소", "내용요약", "Zoom링크"],
    sampleBody:
      "[{프로그램명}] {성명}님, 특강 안내드립니다.\n일시: {일시}\n장소: {장소}\n{내용요약}\n{Zoom링크}",
  },
];
