"use client";

import { useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { lookupSchema } from "@/lib/validation";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CancelConfirmModal } from "@/components/CancelConfirmModal";
import { formatDateRange } from "@/lib/format";
import {
  isApplicationStatus,
  type CancelApplicationResponse,
  type LookupResultItem,
} from "@/lib/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface FormState {
  name: string;
  phone: string;
}

const INITIAL_STATE: FormState = { name: "", phone: "" };

type FieldErrors = Partial<Record<keyof FormState, string>>;

interface CancelMessage {
  type: "success" | "error";
  text: string;
}

async function extractFunctionError(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error;
    } catch {
      // 본문을 읽을 수 없으면 기본 메시지 사용
    }
  }
  return fallback;
}

/** 본인 취소가 가능한 상태 — 서버(cancel-application)와 동일 기준 */
const CANCELLABLE_STATUSES = ["신청완료", "대기"];

/** 표시용 게이팅 — 실제 허용 여부는 서버가 다시 검증한다(시계 오차는 서버 기준으로 정리됨) */
function isCancellable(item: LookupResultItem): boolean {
  return (
    CANCELLABLE_STATUSES.includes(item.status) &&
    !!item.startAt &&
    Date.now() < new Date(item.startAt).getTime()
  );
}

export function LookupForm() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [results, setResults] = useState<LookupResultItem[] | null>(null);
  const [verified, setVerified] = useState<FormState | null>(null);
  const [cancelling, setCancelling] = useState<Record<string, boolean>>({});
  const [cancelMessages, setCancelMessages] = useState<Record<string, CancelMessage>>({});
  const [confirmTarget, setConfirmTarget] = useState<LookupResultItem | null>(null);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setCancelMessage(id: string, message: CancelMessage | null) {
    setCancelMessages((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
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
    setVerified(null);
    setCancelMessages({});

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.functions.invoke("lookup", {
        body: parsed.data,
      });

      if (error) {
        setSubmitError(await extractFunctionError(error, "조회 중 오류가 발생했습니다."));
        setLoading(false);
        return;
      }

      if (!data || !Array.isArray(data.results)) {
        setSubmitError("응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
        setLoading(false);
        return;
      }

      setResults(data.results as LookupResultItem[]);
      setVerified(parsed.data);
    } catch {
      setSubmitError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(item: LookupResultItem) {
    const id = item.applicationId;
    if (!verified || cancelling[id]) return;
    setCancelling((prev) => ({ ...prev, [id]: true }));
    setCancelMessage(id, null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.functions.invoke("cancel-application", {
        body: { ...verified, applicationId: id },
      });

      if (error) {
        setCancelMessage(id, {
          type: "error",
          text: await extractFunctionError(error, "취소 처리 중 오류가 발생했습니다."),
        });
        return;
      }

      const cancelled = data as CancelApplicationResponse;
      if (!cancelled?.ok) {
        setCancelMessage(id, {
          type: "error",
          text: "응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }

      // 배지·버튼이 즉시 반영되도록 결과 목록의 상태를 갱신한다.
      setResults((prev) =>
        (prev ?? []).map((r) => (r.applicationId === id ? { ...r, status: "취소" } : r))
      );
      setCancelMessage(id, {
        type: "success",
        text: "신청이 취소되었습니다. 다시 참여를 원하시면 신청 탭에서 재신청해 주세요.",
      });
    } catch {
      setCancelMessage(id, {
        type: "error",
        text: "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setCancelling((prev) => ({ ...prev, [id]: false }));
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
          입력해 주세요. 조회된 신청 건은 특강 시작 전까지 직접 취소할 수 있습니다.
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
              {results.map((item) => {
                const cancellable = isCancellable(item);
                const isCancelling = !!cancelling[item.applicationId];
                const message = cancelMessages[item.applicationId];
                return (
                  <div
                    key={item.applicationId}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-base font-bold text-brand sm:text-lg">
                        {item.roundLabel || `${item.round}차`} · {item.topic}
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

                    {cancellable && (
                      <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-slate-500 sm:text-sm">
                          특강 시작 전까지 신청을 취소할 수 있습니다.
                        </p>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          className="w-full sm:w-auto"
                          disabled={isCancelling}
                          onClick={() => setConfirmTarget(item)}
                        >
                          {isCancelling ? "취소 처리 중..." : "신청 취소"}
                        </Button>
                      </div>
                    )}

                    {message && (
                      <p
                        role="alert"
                        className={
                          message.type === "success"
                            ? "rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"
                            : "rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                        }
                      >
                        {message.text}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <CancelConfirmModal
        open={confirmTarget !== null}
        item={confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => {
          const target = confirmTarget;
          setConfirmTarget(null);
          if (target) void handleCancel(target);
        }}
      />
    </div>
  );
}
