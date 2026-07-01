"use client";

import { useState } from "react";
import { lookupSchema } from "@/lib/validation";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateRange } from "@/lib/format";
import type { ApplicationStatus } from "@/lib/types";
import type { LookupResultItem } from "@/app/api/lookup/route";

interface FormState {
  name: string;
  phone: string;
}

const INITIAL_STATE: FormState = { name: "", phone: "" };

type FieldErrors = Partial<Record<keyof FormState, string>>;

function isApplicationStatus(status: string): status is ApplicationStatus {
  return ["신청완료", "대기", "취소", "이수"].includes(status);
}

export function LookupForm() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [results, setResults] = useState<LookupResultItem[] | null>(null);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);

    const parsed = lookupSchema.safeParse({ name: form.name, phone: form.phone });

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
    setResults(null);

    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setSubmitError(json?.error ?? "조회 중 오류가 발생했습니다.");
        setLoading(false);
        return;
      }

      setResults((json?.results ?? []) as LookupResultItem[]);
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
        className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-8"
      >
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600 sm:text-sm">
          성명과 연락처가 정확히 일치하는 신청 건만 조회됩니다. 신청 시 입력한 정보와 동일하게
          입력해 주세요.
        </p>

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

        <FormField label="연락처" required error={errors.phone} hint="예: 010-1234-5678">
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

        {submitError && (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          >
            {submitError}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
          {loading ? "조회 중..." : "조회하기"}
        </Button>
      </form>

      {results !== null && (
        <div className="flex flex-col gap-4">
          {results.length === 0 ? (
            <p
              role="status"
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600"
            >
              일치하는 신청 내역이 없습니다. 성명과 연락처를 다시 확인해 주세요.
            </p>
          ) : (
            <div role="status" className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-slate-700">
                총 {results.length}건의 신청 내역이 조회되었습니다.
              </p>
              {results.map((item) => (
                <div
                  key={item.applicationId}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-brand sm:text-lg">
                      {item.round}차 · {item.topic}
                    </h2>
                    {isApplicationStatus(item.status) ? (
                      <StatusBadge status={item.status} />
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">
                        {item.status}
                      </span>
                    )}
                  </div>

                  <div className="text-sm leading-relaxed text-slate-600 sm:text-base">
                    <p>일시: {formatDateRange(item.startAt, item.endAt)}</p>
                    <p>장소: {item.location}</p>
                  </div>

                  {item.status === "이수" && item.certDownloadUrl && (
                    <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                      {item.certNo && (
                        <p className="text-xs text-slate-500 sm:text-sm">
                          수료증 번호: {item.certNo}
                        </p>
                      )}
                      <a
                        href={item.certDownloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        download
                        className="inline-flex w-full sm:w-auto"
                      >
                        <Button variant="secondary" size="sm" className="w-full sm:w-auto">
                          수료증 다운로드
                        </Button>
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
