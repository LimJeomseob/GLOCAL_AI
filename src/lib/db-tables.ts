/**
 * Supabase 테이블 이름 상수. 만족도 응답 테이블은 PRD §6.3 요구사항에 따라
 * 실제 물리 테이블명을 "LAWdata"로 사용한다(PRD §7.3의 survey_responses와 동일 테이블).
 */
export const TABLES = {
  WORKSHOPS: "workshops",
  APPLICATIONS: "applications",
  SURVEY: "LAWdata",
  CERTIFICATES: "certificates",
  CERTIFICATE_TEMPLATES: "certificate_templates",
  ADMIN_USERS: "admin_users",
} as const;

export const CERTIFICATES_BUCKET = "certificates";
