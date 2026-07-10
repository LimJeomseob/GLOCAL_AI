"use client";

import { useId, useState } from "react";
import clsx from "clsx";
import { surveySchema } from "@/lib/validation";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-tables";
import {
  AWARENESS_PATH_OPTIONS,
  SURVEY_LIKERT_QUESTIONS,
  LIKERT_SCALE_LABELS,
  type WorkshopSeed,
} from "@/lib/constants";

interface SurveyFormProps {
  workshopSeeds: WorkshopSeed[];
  initialRound?: number;
}

interface FormState {
  workshop: string;
  awarenessPath: string;
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  q5: string;
  q6: string;
}

const INITIAL_STATE: FormState = {
  workshop: "",
  awarenessPath: "",
  q1: "",
  q2: "",
  q3: "",
  q4: "",
  q5: "",
  q6: "",
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

interface RadioOption {
  value: string;
  label: string;
}

/** 라디오 그룹(fieldset) 공용 렌더러 - 인지경로/척도 문항에서 재사용 */
function RadioGroupField({
  legend,
  required,
  error,
  options,
  name,
  value,
  onChange,
}: {
  legend: string;
  required?: boolean;
  error?: string;
  options: RadioOption[];
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const groupId = useId();
  const errorId = error ? `${groupId}-error` : undefined;

  return (
    <fieldset
      className="flex flex-col gap-2.5"
      aria-describedby={errorId}
      aria-invalid={!!error}
    >
      <legend className="text-sm font-semibold text-slate-800">
        {legend}
        {required && (
          <span className="ml-1 text-red-600" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only">(필수)</span>}
      </legend>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2">
        {options.map((option) => {
          const optionId = `${groupId}-${option.value}`;
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 sm:text-base"
            >
              <input
                id={optionId}
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                className="h-4 w-4 border-slate-300 text-accent focus:ring-accent"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function SurveyForm({ workshopSeeds, initialRound }: SurveyFormProps) {
  // 수료증 발급 완료 팝업 "만족도조사 참여하기"(/survey?round=N)로 진입 시 해당 회차를 자동 선택
  const [form, setForm] = useState<FormState>(() => {
    const seed = workshopSeeds.find((s) => s.round === initialRound);
    return {
      ...INITIAL_STATE,
      workshop: seed ? `제${seed.round}차 · ${seed.topicSummary}` : "",
    };
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitted(false);

    const parsed = surveySchema.safeParse({
      workshop: form.workshop,
      awarenessPath: form.awarenessPath,
      q1: form.q1 === "" ? NaN : Number(form.q1),
      q2: form.q2 === "" ? NaN : Number(form.q2),
      q3: form.q3 === "" ? NaN : Number(form.q3),
      q4: form.q4 === "" ? NaN : Number(form.q4),
      q5: form.q5 === "" ? NaN : Number(form.q5),
      q6: form.q6,
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
    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from(TABLES.SURVEY).insert({
        workshop: parsed.data.workshop,
        awareness_path: parsed.data.awarenessPath,
        q1: parsed.data.q1,
        q2: parsed.data.q2,
        q3: parsed.data.q3,
        q4: parsed.data.q4,
        q5: parsed.data.q5,
        q6: parsed.data.q6,
      });

      if (error) {
        setSubmitError(error.message || "제출 중 오류가 발생했습니다.");
        return;
      }

      setForm(INITIAL_STATE);
      setSubmitted(true);
    } catch {
      setSubmitError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-8"
      >
        <FormField label="참여 프로그램" required error={errors.workshop}>
          {(inputProps) => (
            <select
              {...inputProps}
              className={clsx(inputBaseClass, "bg-white")}
              value={form.workshop}
              onChange={(e) => updateField("workshop", e.target.value)}
            >
              <option value="" disabled>
                참여 프로그램을 선택해 주세요
              </option>
              {workshopSeeds.map((seed) => (
                <option key={seed.round} value={`제${seed.round}차 · ${seed.topicSummary}`}>
                  제{seed.round}차 · {seed.topicSummary}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <RadioGroupField
          legend="이 프로그램을 알게 된 경로"
          required
          error={errors.awarenessPath}
          options={AWARENESS_PATH_OPTIONS.map((option) => ({ value: option, label: option }))}
          name="awarenessPath"
          value={form.awarenessPath}
          onChange={(value) => updateField("awarenessPath", value)}
        />

        <div className="flex flex-col gap-6 border-t border-slate-100 pt-6">
          {SURVEY_LIKERT_QUESTIONS.map((q) => (
            <RadioGroupField
              key={q.key}
              legend={q.text}
              required={q.required}
              error={errors[q.key]}
              options={LIKERT_SCALE_LABELS.map((label, index) => ({
                value: String(index + 1),
                label,
              }))}
              name={q.key}
              value={form[q.key]}
              onChange={(value) => updateField(q.key, value)}
            />
          ))}
        </div>

        <FormField
          label="기타 의견(자유롭게 작성해 주세요)"
          error={errors.q6}
          hint="선택 입력 사항입니다."
        >
          {(inputProps) => (
            <textarea
              {...inputProps}
              className={clsx(inputBaseClass, "min-h-[120px] resize-y")}
              value={form.q6}
              maxLength={2000}
              onChange={(e) => updateField("q6", e.target.value)}
            />
          )}
        </FormField>

        {submitError && (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          >
            {submitError}
          </p>
        )}

        {submitted && (
          <p
            role="status"
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"
          >
            소중한 의견 감사합니다. 설문이 정상적으로 제출되었습니다.
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
          {loading ? "제출 중..." : "제출하기"}
        </Button>
      </form>
    </div>
  );
}
