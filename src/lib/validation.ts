import { z } from "zod";

// 한국 휴대폰 형식: 010-1234-5678, 01012345678, 011-234-5678 등 허용
const PHONE_REGEX = /^01[0-9]-?\d{3,4}-?\d{4}$/;

export const phoneSchema = z
  .string()
  .trim()
  .regex(PHONE_REGEX, "휴대폰 번호 형식이 올바르지 않습니다. (예: 010-1234-5678)");

export const emailSchema = z
  .string()
  .trim()
  .email("이메일 형식이 올바르지 않습니다.");

export const applicationSchema = z.object({
  workshopId: z.string().uuid("워크숍을 선택해 주세요."),
  name: z.string().trim().min(1, "성명을 입력해 주세요.").max(50),
  affiliation: z.string().trim().min(1, "소속을 입력해 주세요.").max(100),
  idNumber: z
    .string()
    .trim()
    .min(1, "교번/직번/학번/생년월일을 입력해 주세요.")
    .max(50),
  phone: phoneSchema,
  email: emailSchema,
  consent: z.literal(true, {
    errorMap: () => ({ message: "개인정보 수집·이용에 동의해 주세요." }),
  }),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;

export const lookupSchema = z.object({
  name: z.string().trim().min(1, "성명을 입력해 주세요."),
  phone: phoneSchema,
});

export type LookupInput = z.infer<typeof lookupSchema>;

export const surveySchema = z.object({
  workshop: z.string().trim().min(1, "참여 프로그램을 선택해 주세요."),
  awarenessPath: z.string().trim().min(1, "인지경로를 선택해 주세요."),
  q1: z.number().int().min(1).max(5),
  q2: z.number().int().min(1).max(5),
  q3: z.number().int().min(1).max(5),
  q4: z.number().int().min(1).max(5),
  q5: z.number().int().min(1).max(5),
  q6: z.string().trim().max(2000).optional().default(""),
});

export type SurveyInput = z.infer<typeof surveySchema>;

export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}
