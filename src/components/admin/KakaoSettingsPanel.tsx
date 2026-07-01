"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-tables";
import { PROGRAM_NAME } from "@/lib/constants";
import { formatDateTime, formatDateRange, formatPhone } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { inputBaseClass } from "@/components/ui/FormField";
import type {
  ApplicationWithWorkshop,
  KakaoAutoSendSettings,
  KakaoDigestState,
  KakaoNotification,
  KakaoTemplate,
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

/** 관리자 화면 미리보기 렌더링(서버 kakao-digest와 동일한 변수 매핑) */
function renderTemplate(body: string, app: ApplicationWithWorkshop | null): string {
  if (!app) return body;
  const w = app.workshop;
  return body
    .replace(/\{성명\}/g, app.name ?? "")
    .replace(/\{프로그램명\}/g, PROGRAM_NAME)
    .replace(/\{회차\}/g, w ? `${w.round}차` : "")
    .replace(/\{상태\}/g, app.status ?? "")
    .replace(/\{일시\}/g, w?.start_at && w?.end_at ? formatDateRange(w.start_at, w.end_at) : "")
    .replace(/\{장소\}/g, w?.location ?? "")
    .replace(/\{유의사항\}/g, (w as { notes?: string })?.notes ?? "")
    .replace(/\{내용요약\}/g, w?.topic ?? "")
    .replace(/\{Zoom링크\}/g, (w as { zoom_link?: string })?.zoom_link ?? "");
}

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

  const [templates, setTemplates] = useState<KakaoTemplate[]>([]);
  const [digestState, setDigestState] = useState<KakaoDigestState | null>(null);
  const [editType, setEditType] = useState<KakaoTemplateType>("1");
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateMessage, setTemplateMessage] = useState<Message | null>(null);

  const [previewApplicationId, setPreviewApplicationId] = useState<string>(applications[0]?.id ?? "");
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestMessage, setDigestMessage] = useState<Message | null>(null);

  // 템플릿 + 다이제스트 상태 로드(관리자 세션 RLS 통과)
  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();
    async function load() {
      const [tplRes, stateRes] = await Promise.all([
        supabase.from(TABLES.KAKAO_TEMPLATES).select("*").order("template_type").returns<KakaoTemplate[]>(),
        supabase
          .from(TABLES.KAKAO_DIGEST_STATE)
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle<KakaoDigestState>(),
      ]);
      if (!active) return;
      if (tplRes.data) setTemplates(tplRes.data);
      if (stateRes.data) setDigestState(stateRes.data);
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const editingTemplate = useMemo(
    () => templates.find((t) => t.template_type === editType) ?? null,
    [templates, editType]
  );

  // 편집 대상 템플릿이 바뀌면 편집 폼을 그 값으로 채운다
  useEffect(() => {
    if (editingTemplate) {
      setEditSubject(editingTemplate.email_subject);
      setEditBody(editingTemplate.body);
    }
  }, [editingTemplate]);

  const previewApplication = useMemo(
    () => applications.find((a) => a.id === previewApplicationId) ?? null,
    [applications, previewApplicationId]
  );

  const activeType: KakaoTemplateType = settings?.active_template_type ?? "1";
  const activeTemplate = useMemo(
    () => templates.find((t) => t.template_type === activeType) ?? null,
    [templates, activeType]
  );

  const previewTargetLine = previewApplication
    ? `[${previewApplication.id_number}, ${previewApplication.name}, ${formatPhone(previewApplication.phone)}]`
    : "";
  const previewBody = renderTemplate(editBody || activeTemplate?.body || "", previewApplication);

  async function persistSettings(patch: Partial<KakaoAutoSendSettings>) {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    const previous = settings;
    setSettings({ ...settings, ...patch });
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from(TABLES.KAKAO_SEND_SETTINGS)
        .update(patch)
        .eq("id", settings.id)
        .select("*")
        .maybeSingle<KakaoAutoSendSettings>();
      if (error || !data) {
        setMessage({
          type: "error",
          text: error?.message ?? "설정이 저장되지 않았습니다. 관리자 권한을 확인해 주세요.",
        });
        setSettings(previous);
        return;
      }
      setSettings(data);
      setMessage({ type: "success", text: "설정이 저장되었습니다." });
    } catch {
      setMessage({ type: "error", text: "네트워크 오류가 발생했습니다." });
      setSettings(previous);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTemplate() {
    setTemplateSaving(true);
    setTemplateMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from(TABLES.KAKAO_TEMPLATES)
        .update({ email_subject: editSubject, body: editBody })
        .eq("template_type", editType)
        .select("*")
        .maybeSingle<KakaoTemplate>();
      if (error || !data) {
        setTemplateMessage({
          type: "error",
          text: error?.message ?? "문구가 저장되지 않았습니다. 관리자 권한을 확인해 주세요.",
        });
        return;
      }
      setTemplates((prev) => prev.map((t) => (t.template_type === editType ? data : t)));
      setTemplateMessage({ type: "success", text: "알림톡 문구가 저장되었습니다." });
    } catch {
      setTemplateMessage({ type: "error", text: "네트워크 오류가 발생했습니다." });
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleSendDigestNow() {
    setDigestLoading(true);
    setDigestMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.functions.invoke("kakao-digest", { body: {} });
      if (error) {
        let text = "대상자 메일 발송에 실패했습니다.";
        if (error instanceof FunctionsHttpError) {
          try {
            const body = await error.context.json();
            if (body?.error) text = body.error;
          } catch {
            /* 본문 파싱 실패 시 기본 메시지 */
          }
        }
        setDigestMessage({ type: "error", text });
        return;
      }
      const count = data?.targetCount ?? 0;
      setDigestMessage({
        type: "success",
        text: data?.emailSent
          ? `대상자 ${count}명 명단을 관리자 이메일로 발송했습니다.`
          : `발송할 신규 대상자가 없습니다(직전 발송 이후 신규 신청자 0명).`,
      });
      // 이력/마지막 발송시각 갱신
      const [tplNotis, stateRes] = await Promise.all([
        supabase
          .from(TABLES.KAKAO_NOTIFICATIONS)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50)
          .returns<KakaoNotification[]>(),
        supabase
          .from(TABLES.KAKAO_DIGEST_STATE)
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle<KakaoDigestState>(),
      ]);
      if (tplNotis.data) setNotifications(tplNotis.data);
      if (stateRes.data) setDigestState(stateRes.data);
    } catch {
      setDigestMessage({ type: "error", text: "네트워크 오류가 발생했습니다." });
    } finally {
      setDigestLoading(false);
    }
  }

  if (!settings) {
    return (
      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800 shadow-card">
        카카오 알림 설정을 불러오지 못했습니다. kakao_send_settings 테이블 초기 데이터를 확인해 주세요.
      </section>
    );
  }

  return (
    <details className="group rounded-2xl border border-slate-200 bg-white shadow-card" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 text-base font-bold text-brand">
        <span>카카오 알림톡 · 관리자 알림 메일</span>
        <span className="text-xs font-medium text-slate-400 group-open:hidden">펼치기</span>
        <span className="hidden text-xs font-medium text-slate-400 group-open:inline">접기</span>
      </summary>

      <div className="flex flex-col gap-6 border-t border-slate-100 px-5 py-5">
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
          알림톡 발송 대상자 명단이 <b>하루 2회(오전 9시 · 오후 4시)</b> 관리자 이메일로 자동 전송됩니다.
          메일에는 대상자별 <b>[ID, 성명, 연락처]</b>와 그 사람 기준으로 완성된 <b>알림톡 문구</b>가 함께 담깁니다.
          아래에서 알림톡 문구를 직접 편집하고, 필요 시 &quot;지금 보내기&quot;로 즉시 발송할 수 있습니다.
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

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 알림톡 문구 편집 */}
          <section className="flex flex-col gap-3 rounded-lg border border-slate-200 px-4 py-4">
            <h3 className="text-sm font-bold text-slate-800">알림톡 문구 편집</h3>
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-template" className="text-xs font-semibold text-slate-600">
                편집할 템플릿
              </label>
              <select
                id="edit-template"
                value={editType}
                onChange={(e) => setEditType(e.target.value as KakaoTemplateType)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-accent"
              >
                {templates.map((t) => (
                  <option key={t.template_type} value={t.template_type}>
                    {t.template_type}. {t.name}
                  </option>
                ))}
                {templates.length === 0 && <option value="1">불러오는 중...</option>}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="edit-subject" className="text-xs font-semibold text-slate-600">
                메일 제목
              </label>
              <input
                id="edit-subject"
                type="text"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                className={inputBaseClass}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="edit-body" className="text-xs font-semibold text-slate-600">
                알림톡 본문
              </label>
              <textarea
                id="edit-body"
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={7}
                className={clsx(inputBaseClass, "font-mono")}
              />
              {editingTemplate && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className="text-xs text-slate-500">사용 가능 변수:</span>
                  {editingTemplate.variables.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setEditBody((b) => `${b}{${v}}`)}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-brand/10 hover:text-brand"
                    >
                      {`{${v}}`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={templateSaving}
              onClick={handleSaveTemplate}
              className="self-start"
            >
              {templateSaving ? "저장 중..." : "문구 저장"}
            </Button>
            {templateMessage && (
              <p
                role="alert"
                className={clsx(
                  "text-xs font-medium",
                  templateMessage.type === "success" ? "text-emerald-700" : "text-red-600"
                )}
              >
                {templateMessage.text}
              </p>
            )}
          </section>

          {/* 발송 설정 + 미리보기 + 지금 보내기 */}
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 px-4 py-4">
              <h3 className="text-sm font-bold text-slate-800">발송 설정</h3>
              <div className="flex items-center justify-between">
                <label htmlFor="email-enabled" className="text-sm font-medium text-slate-700">
                  관리자 알림 메일 사용
                </label>
                <input
                  id="email-enabled"
                  type="checkbox"
                  checked={settings.email_enabled}
                  disabled={saving}
                  onChange={(e) => persistSettings({ email_enabled: e.target.checked })}
                  className="h-5 w-5 accent-accent"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="active-template" className="text-xs font-semibold text-slate-600">
                  다이제스트에 사용할 활성 템플릿
                </label>
                <select
                  id="active-template"
                  value={activeType}
                  disabled={saving}
                  onChange={(e) =>
                    persistSettings({ active_template_type: e.target.value as KakaoTemplateType })
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-accent"
                >
                  {templates.map((t) => (
                    <option key={t.template_type} value={t.template_type}>
                      {t.template_type}. {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.notify_when_empty}
                  disabled={saving}
                  onChange={(e) => persistSettings({ notify_when_empty: e.target.checked })}
                  className="h-4 w-4 accent-accent"
                />
                대상자가 없어도 &quot;대상 없음&quot; 메일 발송
              </label>
              <p className="text-xs text-slate-400">
                마지막 발송: {digestState ? formatDateTime(digestState.last_run_at) : "-"} · 설정 저장:{" "}
                {formatDateTime(settings.updated_at)}
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 px-4 py-4">
              <h3 className="text-sm font-bold text-slate-800">미리보기 · 지금 보내기</h3>
              <div className="flex flex-col gap-1">
                <label htmlFor="preview-applicant" className="text-xs font-semibold text-slate-600">
                  미리보기 대상 신청자
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
              <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-700">
                {previewApplication
                  ? `${previewTargetLine}\n── 알림톡 내용 ──\n${previewBody}`
                  : "미리볼 신청자를 선택해 주세요."}
              </pre>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={digestLoading}
                onClick={handleSendDigestNow}
                className="self-start"
              >
                {digestLoading ? "발송 중..." : "지금 대상자 메일 보내기"}
              </Button>
              {digestMessage && (
                <p
                  role="alert"
                  className={clsx(
                    "text-xs font-medium",
                    digestMessage.type === "success" ? "text-emerald-700" : "text-red-600"
                  )}
                >
                  {digestMessage.text}
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-slate-800">발송 이력(최근 50건)</p>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <caption className="sr-only">카카오 알림 발송 이력 테이블</caption>
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    수신 연락처
                  </th>
                  <th scope="col" className="px-3 py-2">
                    채널
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
                {notifications.map((n) => (
                  <tr key={n.id}>
                    <td className="px-3 py-2 text-slate-700">{formatPhone(n.recipient)}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {n.channel === "email" ? "관리자 메일" : n.channel ?? "-"}
                    </td>
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
                ))}
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
