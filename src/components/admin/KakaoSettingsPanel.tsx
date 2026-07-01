"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-tables";
import { KAKAO_TEMPLATES, PROGRAM_NAME } from "@/lib/constants";
import { formatDateTime, formatDateRange } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { inputBaseClass } from "@/components/ui/FormField";
import type {
  ApplicationWithWorkshop,
  KakaoAutoSendSettings,
  KakaoNotification,
  KakaoTemplateType,
} from "@/lib/types";

interface Message {
  type: "success" | "error";
  text: string;
}

const NOTIFICATION_STATUS_CLASSES: Record<string, string> = {
  대기: "bg-amber-100 text-amber-800",
  성공: "bg-emerald-100 text-emerald-800",
  실패: "bg-red-100 text-red-700",
};

export function KakaoSettingsPanel({
  initialSettings,
  initialNotifications,
  applications,
}: {
  initialSettings: KakaoAutoSendSettings | null;
  initialNotifications: KakaoNotification[];
  applications: ApplicationWithWorkshop[];
}) {
  const [settings, setSettings] = useState<KakaoAutoSendSettings | null>(initialSettings);
  const [notifications, setNotifications] = useState<KakaoNotification[]>(initialNotifications);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const [roundFilter, setRoundFilter] = useState("전체");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [previewTemplateType, setPreviewTemplateType] = useState<KakaoTemplateType>("1");
  const [previewApplicationId, setPreviewApplicationId] = useState<string>(
    applications[0]?.id ?? ""
  );
  const [manualSendLoading, setManualSendLoading] = useState(false);
  const [manualSendMessage, setManualSendMessage] = useState<Message | null>(null);

  const rounds = useMemo(() => {
    const set = new Set<number>();
    applications.forEach((a) => set.add(a.workshop.round));
    return Array.from(set).sort((a, b) => a - b);
  }, [applications]);

  const targetApplications = useMemo(() => {
    return applications.filter((a) => {
      if (roundFilter !== "전체" && String(a.workshop.round) !== roundFilter) return false;
      if (statusFilter !== "전체" && a.status !== statusFilter) return false;
      return true;
    });
  }, [applications, roundFilter, statusFilter]);

  const previewApplication = useMemo(
    () => applications.find((a) => a.id === previewApplicationId) ?? null,
    [applications, previewApplicationId]
  );

  const previewTemplate = useMemo(
    () => KAKAO_TEMPLATES.find((t) => t.type === previewTemplateType) ?? KAKAO_TEMPLATES[0],
    [previewTemplateType]
  );

  const previewBody = useMemo(() => {
    if (!previewTemplate) return "";
    let body = previewTemplate.sampleBody;
    if (previewApplication) {
      body = body
        .replace(/\{성명\}/g, previewApplication.name)
        .replace(
          /\{일시\}/g,
          previewApplication.workshop.start_at && previewApplication.workshop.end_at
            ? formatDateRange(
                previewApplication.workshop.start_at,
                previewApplication.workshop.end_at
              )
            : ""
        )
        .replace(/\{장소\}/g, previewApplication.workshop.location ?? "")
        .replace(/\{상태\}/g, previewApplication.status)
        .replace(/\{회차\}/g, `${previewApplication.workshop.round}차`)
        .replace(/\{프로그램명\}/g, PROGRAM_NAME);
    }
    return body;
  }, [previewTemplate, previewApplication]);

  async function persistSettings(patch: Partial<KakaoAutoSendSettings>) {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    const nextSettings = { ...settings, ...patch };
    setSettings(nextSettings);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from(TABLES.KAKAO_SEND_SETTINGS)
        .update(patch)
        .eq("id", settings.id);
      if (error) {
        setMessage({ type: "error", text: error.message });
        setSettings(settings);
        return;
      }
      setMessage({ type: "success", text: "설정이 저장되었습니다." });
    } catch {
      setMessage({ type: "error", text: "네트워크 오류가 발생했습니다." });
      setSettings(settings);
    } finally {
      setSaving(false);
    }
  }

  async function handleManualSend() {
    if (!previewApplication) {
      setManualSendMessage({ type: "error", text: "발송 대상 신청 건을 선택해 주세요." });
      return;
    }
    setManualSendLoading(true);
    setManualSendMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from(TABLES.KAKAO_NOTIFICATIONS)
        .insert({
          application_id: previewApplication.id,
          recipient: previewApplication.phone,
          template_type: previewTemplateType,
          status: "대기",
        })
        .select("*")
        .single<KakaoNotification>();

      if (error || !data) {
        setManualSendMessage({ type: "error", text: error?.message ?? "발송 대기 등록에 실패했습니다." });
        return;
      }

      setNotifications((prev) => [data, ...prev]);
      setManualSendMessage({
        type: "success",
        text: "발송 대기 이력이 등록되었습니다. 실제 발송은 후속 카카오 API 연동 후 처리됩니다.",
      });
    } catch {
      setManualSendMessage({ type: "error", text: "네트워크 오류가 발생했습니다." });
    } finally {
      setManualSendLoading(false);
    }
  }

  if (!settings) {
    return (
      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800 shadow-card">
        카카오 자동발송 설정을 불러오지 못했습니다. kakao_send_settings 테이블 초기 데이터를 확인해 주세요.
      </section>
    );
  }

  return (
    <details className="group rounded-2xl border border-slate-200 bg-white shadow-card" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 text-base font-bold text-brand">
        <span>카카오 알림 자동발송 설정</span>
        <span className="text-xs font-medium text-slate-400 group-open:hidden">펼치기</span>
        <span className="hidden text-xs font-medium text-slate-400 group-open:inline">접기</span>
      </summary>

      <div className="flex flex-col gap-6 border-t border-slate-100 px-5 py-5">
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
          실제 카카오 알림톡 발송 연동은 후속 범위입니다. 이 화면에서의 설정 저장 및 &quot;수동 발송&quot;은
          발송 대기 이력만 기록하며, 실제 발송은 후속 카카오 API 연동 후 처리됩니다.
        </p>

        {message && (
          <p
            role="alert"
            className={clsx(
              "rounded-lg border px-4 py-3 text-sm font-medium",
              message.type === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-red-300 bg-red-50 text-red-700"
            )}
          >
            {message.text}
          </p>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
              <label htmlFor="kakao-enabled" className="text-sm font-semibold text-slate-800">
                자동발송 사용
              </label>
              <input
                id="kakao-enabled"
                type="checkbox"
                checked={settings.enabled}
                disabled={saving}
                onChange={(e) => persistSettings({ enabled: e.target.checked })}
                className="h-5 w-5 accent-accent"
              />
            </div>

            <fieldset className="flex flex-col gap-2 rounded-lg border border-slate-200 px-4 py-3">
              <legend className="px-1 text-sm font-semibold text-slate-800">템플릿별 활성화</legend>
              {KAKAO_TEMPLATES.map((tpl) => {
                const key =
                  tpl.type === "1"
                    ? "template_1_enabled"
                    : tpl.type === "2"
                      ? "template_2_enabled"
                      : "template_3_enabled";
                const checked = settings[key as keyof KakaoAutoSendSettings] as boolean;
                return (
                  <label key={tpl.type} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={saving}
                      onChange={(e) => persistSettings({ [key]: e.target.checked } as Partial<KakaoAutoSendSettings>)}
                      className="h-4 w-4 accent-accent"
                    />
                    <span className="font-medium">{tpl.name}</span>
                    <span className="text-xs text-slate-500">— {tpl.description}</span>
                  </label>
                );
              })}
            </fieldset>

            <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 px-4 py-3">
              <label htmlFor="schedule-days" className="text-sm font-semibold text-slate-800">
                예약 발송 시점(D-N, 프로그램 시작일 N일 전)
              </label>
              <input
                id="schedule-days"
                type="number"
                min={0}
                max={30}
                value={settings.schedule_days_before}
                disabled={saving}
                onChange={(e) =>
                  persistSettings({ schedule_days_before: Number(e.target.value) || 0 })
                }
                className={inputBaseClass}
              />
              <p className="text-xs text-slate-500">
                예: 2 입력 시 프로그램 시작 2일 전(D-2)에 자동발송 대상이 됩니다.
              </p>
            </div>

            <p className="text-xs text-slate-400">최종 저장: {formatDateTime(settings.updated_at)}</p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">발송 대상 필터(미리보기용)</p>
              <div className="flex flex-wrap gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="kakao-round-filter" className="text-xs font-semibold text-slate-600">
                    회차
                  </label>
                  <select
                    id="kakao-round-filter"
                    value={roundFilter}
                    onChange={(e) => setRoundFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-accent"
                  >
                    <option value="전체">전체</option>
                    {rounds.map((r) => (
                      <option key={r} value={String(r)}>
                        {r}차
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="kakao-status-filter" className="text-xs font-semibold text-slate-600">
                    상태
                  </label>
                  <select
                    id="kakao-status-filter"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-accent"
                  >
                    <option value="전체">전체</option>
                    <option value="신청완료">신청완료</option>
                    <option value="대기">대기</option>
                    <option value="취소">취소</option>
                    <option value="이수">이수</option>
                  </select>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                현재 조건의 발송 대상: <span className="font-bold text-brand">{targetApplications.length}건</span>
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">발송 미리보기 / 수동 발송</p>
              <div className="flex flex-wrap gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="preview-template" className="text-xs font-semibold text-slate-600">
                    템플릿
                  </label>
                  <select
                    id="preview-template"
                    value={previewTemplateType}
                    onChange={(e) => setPreviewTemplateType(e.target.value as KakaoTemplateType)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-accent"
                  >
                    {KAKAO_TEMPLATES.map((tpl) => (
                      <option key={tpl.type} value={tpl.type}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <label htmlFor="preview-applicant" className="text-xs font-semibold text-slate-600">
                    대상 신청자
                  </label>
                  <select
                    id="preview-applicant"
                    value={previewApplicationId}
                    onChange={(e) => setPreviewApplicationId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-accent"
                  >
                    {applications.length === 0 && <option value="">신청자 없음</option>}
                    {applications.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.workshop.round}차 · {a.name} ({a.phone})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-700">
                {previewBody || "미리볼 신청자를 선택해 주세요."}
              </pre>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={manualSendLoading || !previewApplication}
                onClick={handleManualSend}
                className="self-start"
              >
                {manualSendLoading ? "등록 중..." : "수동 발송(대기 이력 등록)"}
              </Button>

              {manualSendMessage && (
                <p
                  role="alert"
                  className={clsx(
                    "text-xs font-medium",
                    manualSendMessage.type === "success" ? "text-emerald-700" : "text-red-600"
                  )}
                >
                  {manualSendMessage.text}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-slate-800">발송 이력(최근 50건)</p>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <caption className="sr-only">카카오 알림 발송 이력 테이블</caption>
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    수신자
                  </th>
                  <th scope="col" className="px-3 py-2">
                    템플릿유형
                  </th>
                  <th scope="col" className="px-3 py-2">
                    상태
                  </th>
                  <th scope="col" className="px-3 py-2">
                    발송시각
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {notifications.map((n) => {
                  const templateName =
                    KAKAO_TEMPLATES.find((t) => t.type === n.template_type)?.name ?? n.template_type;
                  return (
                    <tr key={n.id}>
                      <td className="px-3 py-2 text-slate-700">{n.recipient}</td>
                      <td className="px-3 py-2 text-slate-700">{templateName}</td>
                      <td className="px-3 py-2">
                        <span
                          className={clsx(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold",
                            NOTIFICATION_STATUS_CLASSES[n.status] ?? "bg-slate-200 text-slate-600"
                          )}
                        >
                          {n.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                        {n.sent_at ? formatDateTime(n.sent_at) : "-"}
                      </td>
                    </tr>
                  );
                })}
                {notifications.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">
                      발송 이력이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </details>
  );
}
