/**
 * Supabase(Postgres) 테이블과 1:1로 대응하는 타입 정의 (PRD §7 참조)
 */

export type WorkshopLevel = "초급" | "중급" | "고급";

export interface WorkshopSession {
  time_label: string; // 예: "13:00~15:00"
  topic: string; // 강의주제
  content: string; // 주요 교육내용
}

/** workshops 테이블 1행 = 회차 1개(7월 1~5차, 8월 1~3차). 2세션 상세는 sessions(jsonb)에 보관 (PRD §13.2) */
export interface Workshop {
  id: string;
  round: number; // 내부 연번(1~8). 수료증 번호·/apply?round=N 키
  round_label: string; // 화면 표시용 라벨(예: "7월 1차", "8월 3차")
  topic: string; // 회차 대표 주제(요약)
  instructor: string;
  location: string;
  capacity: number;
  start_at: string; // timestamptz
  end_at: string; // timestamptz
  deadline: string; // timestamptz = start_at - 2일
  apply_open_at: string; // timestamptz = 신청 시작(오픈) 일시
  level: WorkshopLevel;
  target: string;
  sessions: WorkshopSession[]; // 회차별 세부 강의(2세션)
  notes: string; // 협조사항(§13.3)
  created_at: string;
}

export type ApplicationStatus = "신청완료" | "대기" | "취소" | "이수";

/** ApplicationStatus의 전체 값 목록(단일 출처). 상태 드롭다운/타입가드 등에서 재사용한다. */
export const APPLICATION_STATUSES: ApplicationStatus[] = ["신청완료", "대기", "취소", "이수"];

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as string[]).includes(value);
}

export interface Application {
  id: string;
  workshop_id: string;
  name: string;
  affiliation: string;
  id_number: string;
  phone: string;
  email: string;
  consent: boolean;
  status: ApplicationStatus;
  cert_issued: boolean;
  kakao_notice1_sent: boolean;
  kakao_notice2_sent: boolean;
  kakao_notice3_sent: boolean;
  created_by_admin: boolean;
  created_at: string;
}

/** applications + workshops 조인 결과(관리자 테이블, 조회 결과 등에서 사용) */
export interface ApplicationWithWorkshop extends Application {
  workshop: Pick<
    Workshop,
    "id" | "round" | "round_label" | "topic" | "start_at" | "end_at" | "location"
  >;
}

export interface SurveyResponse {
  id: string;
  workshop: string;
  awareness_path: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  q5: number;
  q6: string;
  submitted_at: string;
}

export interface Certificate {
  id: string;
  application_id: string;
  cert_no: string;
  issuer: string;
  issued_at: string;
  reissue_count: number;
  pdf_path: string | null;
  issued_channel: "admin" | "public";
}

/** certificate_templates.template — 수료증 서식 PDF를 변환한 JSON(이미지 base64 보존) */
export interface CertificateTemplateImage {
  key: string;
  dataUrl: string; // data:image/jpeg;base64,...
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CertificateTemplateText {
  key: string;
  text: string; // {발급번호}{성명}{소속}{프로그램명}{기간}{발급일} 치환 변수 지원
  x?: number; // align 'left'일 때 사용
  y: number; // 하단 기준 베이스라인(pt)
  size: number;
  weight?: "regular" | "bold";
  align?: "left" | "center";
  color?: string; // hex, 기본 #000000
  maxWidth?: number; // 지정 시 폭에 맞을 때까지 글자 크기 자동 축소
}

export interface CertificateTemplate {
  version: number;
  page: { width: number; height: number };
  images: CertificateTemplateImage[];
  texts: CertificateTemplateText[];
}

/** POST supabase.functions.invoke("issue-certificate") 응답 (Edge Function과 동일 shape) */
export interface IssueCertificateResponse {
  certNo: string;
  issuedAt: string;
  reissueCount: number;
  name: string;
  affiliation: string;
  round: number;
  roundLabel: string;
  topic: string;
  startAt: string;
  endAt: string;
  template: CertificateTemplate;
  upload: { path: string; token: string };
}

/** POST supabase.functions.invoke("cancel-application") 응답 (Edge Function과 동일 shape) */
export interface CancelApplicationResponse {
  ok: boolean;
  applicationId: string;
  status: string;
}

/** POST supabase.functions.invoke("lookup") 응답의 각 항목 (Edge Function과 동일한 shape 유지) */
export interface LookupResultItem {
  applicationId: string;
  round: number;
  roundLabel: string;
  topic: string;
  startAt: string;
  endAt: string;
  location: string;
  status: string;
  certNo: string | null;
  certDownloadUrl: string | null;
}

export type AdminRole = "admin" | "superadmin";

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
}

export type KakaoTemplateType = "1" | "2" | "3";
export type KakaoNotificationStatus = "대기" | "성공" | "실패";

export interface KakaoNotification {
  id: string;
  application_id: string;
  recipient: string;
  template_type: KakaoTemplateType;
  sent_at: string | null;
  status: KakaoNotificationStatus;
  response_code: string | null;
  retry_count: number;
  channel?: string;
  error_message?: string | null;
}

export interface KakaoAutoSendSettings {
  id: string;
  enabled: boolean;
  template_1_enabled: boolean;
  template_2_enabled: boolean;
  template_3_enabled: boolean;
  schedule_days_before: number; // (c) D-N 예약발송 기준일
  active_template_type: KakaoTemplateType; // 다이제스트 메일에 사용할 활성 템플릿
  email_enabled: boolean; // 관리자 알림 메일 사용 여부
  notify_when_empty: boolean; // 대상자 0명일 때도 메일 발송할지
  updated_at: string;
}

/** kakao_templates — 관리자가 편집하는 알림톡/메일 문구 */
export interface KakaoTemplate {
  id: string;
  template_type: KakaoTemplateType;
  name: string;
  email_subject: string;
  body: string;
  variables: string[];
  enabled: boolean;
  updated_at: string;
}

/** kakao_digest_state — 다이제스트 워터마크(직전 발송 시각) */
export interface KakaoDigestState {
  id: string;
  last_run_at: string;
  updated_at: string;
}
