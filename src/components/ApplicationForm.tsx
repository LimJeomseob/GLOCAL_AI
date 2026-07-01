"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { applicationSchema } from "@/lib/validation";
import { TABLES } from "@/lib/db-tables";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { formatDateRange, formatDateTime } from "@/lib/format";

export interface WorkshopOption {
  id: string;
  round: number;
  topic: string;
  instructor: string;
  location: string;
  startAt: string;
  endAt: string;
  deadline: string;
  remaining: number;
  isClosed: boolean;
}

interface FormState {
  workshopId: string;
  name: string;
  affiliation: string;
  idNumber: string;
  phone: string;
  email: string;
  consent: boolean;
}

const INITIAL_STATE: FormState = {
  workshopId: "",
  name: "",
  affiliation: "",
  idNumber: "",
  phone: "",
  email: "",
  consent: false,
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

export function ApplicationForm({ workshopOptions }: { workshopOptions: WorkshopOption[] }) {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const allClosed = workshopOptions.length === 0 || workshopOptions.every((w) => w.isClosed);
  const selectedWorkshop = workshopOptions.find((w) => w.id === form.workshopId);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);

    const parsed = applicationSchema.safeParse({
      workshopId: form.workshopId,
      name: form.name,
      affiliation: form.affiliation,
      idNumber: form.idNumber,
      phone: form.phone,
      email: form.email,
      consent: form.consent,
    });

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState;
        if (!fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from(TABLES.APPLICATIONS).insert({
      workshop_id: parsed.data.workshopId,
      name: parsed.data.name,
      affiliation: parsed.data.affiliation,
      id_number: parsed.data.idNumber,
      phone: parsed.data.phone,
      email: parsed.data.email,
      consent: true,
    });

    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    setSubmitted(true);
    setForm(INITIAL_STATE);
  }

  if (submitted) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-10"
      >
        <h1 className="text-xl font-bold text-brand sm:text-2xl">신청이 완료되었습니다</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
          신청해 주셔서 감사합니다. 신청 내역은 아래 &quot;신청내역조회&quot; 탭에서 성명과
          연락처로 확인하실 수 있습니다.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/lookup">
            <Button variant="primary" size="lg" className="w-full sm:w-auto">
              신청내역조회로 이동
            </Button>
          </Link>
          <Button
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => setSubmitted(false)}
          >
            추가 신청하기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-brand sm:text-2xl">특강 신청</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          희망하는 회차를 선택하고 신청 정보를 입력해 주세요.
        </p>
      </div>

      {allClosed && (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800"
        >
          모든 회차의 신청이 마감되었습니다. 다음 특강 일정을 기다려 주세요.
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-8"
      >
        <FormField label="워크숍명" required error={errors.workshopId}>
          {(inputProps) => (
            <select
              {...inputProps}
              className={inputBaseClass}
              value={form.workshopId}
              disabled={allClosed}
              onChange={(e) => updateField("workshopId", e.target.value)}
            >
              <option value="">회차를 선택해 주세요</option>
              {workshopOptions.map((w) => (
                <option key={w.id} value={w.id} disabled={w.isClosed}>
                  {`${w.round}차 - ${w.topic} (${formatDateRange(w.startAt, w.endAt)})`}
                  {w.isClosed
                    ? " (마감)"
                    : ` (잔여 ${w.remaining}명)`}
                </option>
              ))}
            </select>
          )}
        </FormField>

        {selectedWorkshop && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600 sm:text-sm">
            <p>
              강사: {selectedWorkshop.instructor} · 장소: {selectedWorkshop.location}
            </p>
            <p>일시: {formatDateRange(selectedWorkshop.startAt, selectedWorkshop.endAt)}</p>
            <p>신청 마감: {formatDateTime(selectedWorkshop.deadline)}까지</p>
          </div>
        )}

        <FormField label="성명" required error={errors.name}>
          {(inputProps) => (
            <input
              {...inputProps}
              type="text"
              className={inputBaseClass}
              value={form.name}
              autoComplete="name"
              onChange={(e) => updateField("name", e.target.value)}
            />
          )}
        </FormField>

        <FormField label="소속" required error={errors.affiliation}>
          {(inputProps) => (
            <input
              {...inputProps}
              type="text"
              className={inputBaseClass}
              value={form.affiliation}
              placeholder="예: 경상국립대학교 OO학과, OO기관"
              onChange={(e) => updateField("affiliation", e.target.value)}
            />
          )}
        </FormField>

        <FormField
          label="교번/직번/학번/생년월일"
          required
          error={errors.idNumber}
          hint="교번, 직번, 학번 중 해당하는 번호 또는 생년월일(예: 900101)을 입력해 주세요."
        >
          {(inputProps) => (
            <input
              {...inputProps}
              type="text"
              className={inputBaseClass}
              value={form.idNumber}
              onChange={(e) => updateField("idNumber", e.target.value)}
            />
          )}
        </FormField>

        <FormField
          label="연락처"
          required
          error={errors.phone}
          hint="예: 010-1234-5678"
        >
          {(inputProps) => (
            <input
              {...inputProps}
              type="tel"
              className={inputBaseClass}
              value={form.phone}
              autoComplete="tel"
              placeholder="010-1234-5678"
              onChange={(e) => updateField("phone", e.target.value)}
            />
          )}
        </FormField>

        <FormField label="이메일" required error={errors.email}>
          {(inputProps) => (
            <input
              {...inputProps}
              type="email"
              className={inputBaseClass}
              value={form.email}
              autoComplete="email"
              placeholder="example@gnu.ac.kr"
              onChange={(e) => updateField("email", e.target.value)}
            />
          )}
        </FormField>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-bold text-slate-800">개인정보 수집·이용 동의</h2>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-600">
            <li>· 수집 항목: 성명, 소속, 교번/직번/학번/생년월일, 연락처, 이메일</li>
            <li>· 수집 목적: 특강 신청·운영, 수료증 발급, 안내 문자 발송</li>
            <li>· 보유 기간: 특강 종료 후 1년 또는 관계 법령에 따름</li>
            <li>· 동의를 거부하실 수 있으나, 거부 시 특강 신청이 불가합니다.</li>
          </ul>

          <FormField label="동의 여부" required error={errors.consent}>
            {(inputProps) => (
              <label
                htmlFor={inputProps.id}
                className="mt-1 flex items-start gap-2 text-sm font-medium text-slate-800"
              >
                <input
                  {...inputProps}
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-accent focus:ring-accent"
                  checked={form.consent}
                  onChange={(e) => updateField("consent", e.target.checked)}
                />
                <span>개인정보 수집·이용에 동의합니다. (필수)</span>
              </label>
            )}
          </FormField>
        </div>

        {submitError && (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          >
            {submitError}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={submitting || allClosed}>
          {submitting ? "제출 중..." : "신청하기"}
        </Button>
      </form>
    </div>
  );
}
