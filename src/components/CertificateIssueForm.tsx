"use client";

import { useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { lookupSchema } from "@/lib/validation";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateRange } from "@/lib/format";
import {
  isApplicationStatus,
  type IssueCertificateResponse,
  type LookupResultItem,
} from "@/lib/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CERTIFICATES_BUCKET } from "@/lib/db-tables";

interface FormState {
  name: string;
  phone: string;
}

const INITIAL_STATE: FormState = { name: "", phone: "" };

type FieldErrors = Partial<Record<keyof FormState, string>>;

interface IssueMessage {
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

function triggerPdfDownload(bytes: Uint8Array, fileName: string): Blob {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return blob;
}

export function CertificateIssueForm() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [results, setResults] = useState<LookupResultItem[] | null>(null);
  const [verified, setVerified] = useState<FormState | null>(null);
  const [issuing, setIssuing] = useState<Record<string, boolean>>({});
  const [issueMessages, setIssueMessages] = useState<Record<string, IssueMessage>>({});

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setIssueMessage(id: string, message: IssueMessage | null) {
    setIssueMessages((prev) => {
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
    setIssueMessages({});

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

  async function handleIssue(item: LookupResultItem) {
    if (!verified) return;
    const id = item.applicationId;
    setIssuing((prev) => ({ ...prev, [id]: true }));
    setIssueMessage(id, null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.functions.invoke("issue-certificate", {
        body: { ...verified, applicationId: id },
      });

      if (error) {
        setIssueMessage(id, {
          type: "error",
          text: await extractFunctionError(error, "수료증 발급 중 오류가 발생했습니다."),
        });
        return;
      }

      const issued = data as IssueCertificateResponse;
      if (!issued?.certNo || !issued.template) {
        setIssueMessage(id, {
          type: "error",
          text: "발급 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }

      // PDF는 브라우저에서 생성한다(fontkit이 Deno Edge Function에서 실패 — certificatePdf.ts 참조).
      const { renderCertificateFromTemplate, buildCertificateValues } = await import(
        "@/lib/certificatePdf"
      );
      const values = buildCertificateValues({
        certNo: issued.certNo,
        name: issued.name,
        affiliation: issued.affiliation,
        round: issued.round,
        topic: issued.topic,
        startAt: issued.startAt,
        endAt: issued.endAt,
        issuedAt: issued.issuedAt,
      });
      const pdfBytes = await renderCertificateFromTemplate(issued.template, values);

      // 사용자 파일 확보가 우선 — 다운로드 먼저, 보관본 업로드는 그 다음.
      const blob = triggerPdfDownload(pdfBytes, `수료증_${issued.certNo}.pdf`);

      let uploadFailed = false;
      const upload = () =>
        supabase.storage
          .from(CERTIFICATES_BUCKET)
          .uploadToSignedUrl(issued.upload.path, issued.upload.token, blob, {
            contentType: "application/pdf",
          });
      const { error: uploadError } = await upload();
      if (uploadError) {
        const { error: retryError } = await upload();
        uploadFailed = !!retryError;
      }

      setIssueMessage(id, {
        type: "success",
        text: uploadFailed
          ? `수료증(${issued.certNo})이 다운로드되었습니다. 보관본 저장에는 실패했으니, 신청내역조회에서 다운로드가 안 되면 다시 발급해 주세요.`
          : `수료증(${issued.certNo})이 발급되어 다운로드되었습니다.`,
      });

      // 카드에 발급번호가 바로 보이도록 결과 목록을 갱신한다.
      setResults((prev) =>
        (prev ?? []).map((r) =>
          r.applicationId === id ? { ...r, certNo: issued.certNo } : r
        )
      );
    } catch {
      setIssueMessage(id, {
        type: "error",
        text: "수료증 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setIssuing((prev) => ({ ...prev, [id]: false }));
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
          성명과 연락처가 정확히 일치하는 신청 건만 조회됩니다. 수료증은 이수처리가 완료된
          신청 건에 한해 발급됩니다.
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
          {loading ? "조회 중..." : "신청 내역 조회"}
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
                총 {results.length}건의 신청 내역이 조회되었습니다. 이수 완료된 건은 아래에서
                수료증을 발급받을 수 있습니다.
              </p>
              {results.map((item) => {
                const isCompleted = item.status === "이수";
                const isIssuing = !!issuing[item.applicationId];
                const message = issueMessages[item.applicationId];
                return (
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

                    <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-3">
                      {isCompleted ? (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          {item.certNo ? (
                            <p className="text-xs text-slate-500 sm:text-sm">
                              수료증 번호: {item.certNo}
                            </p>
                          ) : (
                            <p className="text-xs text-slate-500 sm:text-sm">
                              아직 발급 이력이 없습니다.
                            </p>
                          )}
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            className="w-full sm:w-auto"
                            disabled={isIssuing}
                            onClick={() => handleIssue(item)}
                          >
                            {isIssuing
                              ? "발급 중..."
                              : item.certNo
                                ? "수료증 재발급(PDF)"
                                : "수료증 발급(PDF)"}
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 sm:text-sm">
                          이수처리가 완료된 후 수료증을 발급받을 수 있습니다.
                        </p>
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
