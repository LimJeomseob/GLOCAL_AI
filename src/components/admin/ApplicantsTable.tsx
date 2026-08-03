"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-tables";
import { NOTICE_COLUMNS, type NoticeField } from "@/lib/constants";
import { formatDateTime, formatDateRange } from "@/lib/format";
import { exportRowsAsCsv } from "@/lib/csv";
import { issueCertificatesForApplications } from "@/lib/issueCertificate";
import { adminApplicationSchema, normalizePhone } from "@/lib/validation";
import { deriveWorkshopStatus, fetchWorkshopsWithAvailability } from "@/lib/workshops";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { APPLICATION_STATUSES, type ApplicationStatus, type ApplicationWithWorkshop } from "@/lib/types";

const STATUS_OPTIONS = APPLICATION_STATUSES;

interface RowMessage {
  type: "success" | "error";
  text: string;
  downloadUrl?: string;
}

function BoolBadge({ value, trueLabel, falseLabel }: { value: boolean; trueLabel: string; falseLabel: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold",
        value ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
      )}
    >
      {value ? trueLabel : falseLabel}
    </span>
  );
}

type StatusFilterValue = "전체" | ApplicationStatus;

/** 상태 필터 선택지. 상단 필터바와 표 제목줄 필터가 같은 값을 공유한다. */
const STATUS_FILTER_OPTIONS: readonly StatusFilterValue[] = ["전체", ...APPLICATION_STATUSES];

interface ColumnFilters {
  topic: string;
  name: string;
  affiliation: string;
  idNumber: string;
  phone: string;
  email: string;
  status: StatusFilterValue;
  certIssued: "전체" | "발급완료" | "미발급";
}

const INITIAL_COLUMN_FILTERS: ColumnFilters = {
  topic: "",
  name: "",
  affiliation: "",
  idNumber: "",
  phone: "",
  email: "",
  status: "전체",
  certIssued: "전체",
};

type NoticeFilterValue = "전체" | "확인" | "미확인";
type NoticeFilters = Record<NoticeField, NoticeFilterValue>;

function buildInitialNoticeFilters(): NoticeFilters {
  return Object.fromEntries(
    NOTICE_COLUMNS.map(({ field }) => [field, "전체" as NoticeFilterValue])
  ) as NoticeFilters;
}

/** 헤더 내부에 얹는 소형 텍스트 필터 입력 */
function HeaderTextFilter({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  label: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? "필터"}
      aria-label={`${label} 필터`}
      className="w-full min-w-0 rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] font-normal normal-case text-slate-700 placeholder:text-slate-400 focus:border-accent"
    />
  );
}

/** 헤더 내부에 얹는 소형 드롭다운 필터 */
function HeaderSelectFilter<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly T[];
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      aria-label={`${label} 필터`}
      className="w-full min-w-0 rounded border border-slate-300 bg-white px-1 py-1 text-[11px] font-normal normal-case text-slate-700 focus:border-accent"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

/**
 * 관리자가 등록한 건(created_by_admin)을 표에서 구분하는 테두리.
 * 표가 border-collapse이고 tbody가 divide-y(= tr의 border-top)를 쓰므로 tr에 border를 주면
 * 충돌한다. 따라서 셀(td) 테두리로 행 전체를 감싸는 박스를 그린다.
 * 색은 violet 고정 — amber(전역 포커스 링·대기)·blue(신청완료)·emerald(이수)·red(오류)·slate(취소)와
 * 의미가 겹치지 않는 유일한 계열이다.
 */
const ADMIN_ROW_BORDER_CLASS =
  "[&>td]:border-y-2 [&>td]:border-violet-500 [&>td:first-child]:border-l-2 [&>td:last-child]:border-r-2";

const DRAFT_INPUT_CLASS =
  "w-full min-w-0 rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] font-normal text-slate-800 placeholder:text-slate-400 focus:border-accent disabled:bg-slate-100 disabled:text-slate-400";

const DRAFT_ERROR_CLASS = "mt-1 text-[10px] font-medium leading-tight text-red-600";

/** 참여자 추가 입력 행에서 쓰는 회차 옵션(전체 회차 — 마감·오픈 전 회차도 관리자는 선택 가능) */
interface DraftWorkshopOption {
  id: string;
  roundLabel: string;
  topic: string;
  startAt: string;
  endAt: string;
  remaining: number;
  isNotYetOpen: boolean;
  isClosed: boolean;
}

function draftWorkshopLabel(w: DraftWorkshopOption): string {
  const state = w.isNotYetOpen ? "신청 예정" : w.isClosed ? "마감" : null;
  const tags = [state, `잔여 ${w.remaining}명`].filter(Boolean).join(" · ");
  return `${w.roundLabel} - ${w.topic} (${formatDateRange(w.startAt, w.endAt)}) · ${tags}`;
}

/** 참여자 추가 입력 행의 텍스트 입력 셀 */
function DraftTextCell({
  label,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  error?: string;
  type?: "text" | "tel" | "email";
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <td className="px-2 py-2">
      <input
        type={type}
        value={value}
        aria-label={`추가할 참여자의 ${label}`}
        aria-invalid={!!error}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={DRAFT_INPUT_CLASS}
      />
      {error && <p className={DRAFT_ERROR_CLASS}>{error}</p>}
    </td>
  );
}

/** 관리자가 직접 등록하는 참여자 입력 행의 값 */
interface DraftRow {
  workshopId: string;
  name: string;
  affiliation: string;
  idNumber: string;
  phone: string;
  email: string;
  consent: boolean;
  status: ApplicationStatus;
}

const INITIAL_DRAFT: DraftRow = {
  workshopId: "",
  name: "",
  affiliation: "",
  idNumber: "",
  phone: "",
  email: "",
  consent: false,
  status: "신청완료",
};

type DraftFieldErrors = Partial<Record<keyof DraftRow, string>>;

export function ApplicantsTable({
  initialApplications,
}: {
  initialApplications: ApplicationWithWorkshop[];
}) {
  const router = useRouter();
  const [applications, setApplications] = useState<ApplicationWithWorkshop[]>(initialApplications);
  const [roundFilter, setRoundFilter] = useState<string>("전체");
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(INITIAL_COLUMN_FILTERS);
  const [noticeFilters, setNoticeFilters] = useState<NoticeFilters>(buildInitialNoticeFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rowMessages, setRowMessages] = useState<Record<string, RowMessage>>({});
  const [rowLoading, setRowLoading] = useState<Record<string, boolean>>({});
  const [bulkMessage, setBulkMessage] = useState<RowMessage | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<ApplicationStatus>("신청완료");
  const [statusLoading, setStatusLoading] = useState(false);
  const [bulkNoticeStage, setBulkNoticeStage] = useState<NoticeField>("kakao_notice1_sent");
  const [bulkNoticeConfirmed, setBulkNoticeConfirmed] = useState<"확인" | "미확인">("확인");
  const [noticeLoading, setNoticeLoading] = useState(false);
  // 참여자 추가(관리자 직접 등록) 입력 행 — null이면 행이 닫힌 상태
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [draftErrors, setDraftErrors] = useState<DraftFieldErrors>({});
  const [draftMessage, setDraftMessage] = useState<RowMessage | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [workshopOptions, setWorkshopOptions] = useState<DraftWorkshopOption[] | null>(null);
  const [workshopOptionsLoading, setWorkshopOptionsLoading] = useState(false);
  const [workshopOptionsError, setWorkshopOptionsError] = useState<string | null>(null);

  const rounds = useMemo(() => {
    const byRound = new Map<number, string>();
    applications.forEach((a) =>
      byRound.set(a.workshop.round, a.workshop.round_label || `${a.workshop.round}차`)
    );
    return Array.from(byRound.entries())
      .sort(([a], [b]) => a - b)
      .map(([round, label]) => ({ round, label }));
  }, [applications]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const topicKw = columnFilters.topic.trim().toLowerCase();
    const nameKw = columnFilters.name.trim().toLowerCase();
    const affiliationKw = columnFilters.affiliation.trim().toLowerCase();
    const idNumberKw = columnFilters.idNumber.trim().toLowerCase();
    const phoneKw = columnFilters.phone.trim().toLowerCase();
    const emailKw = columnFilters.email.trim().toLowerCase();

    return applications.filter((a) => {
      if (roundFilter !== "전체" && String(a.workshop.round) !== roundFilter) return false;
      if (columnFilters.status !== "전체" && a.status !== columnFilters.status) return false;
      if (keyword) {
        const haystack = `${a.name} ${a.email} ${a.phone}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      if (topicKw && !a.workshop.topic.toLowerCase().includes(topicKw)) return false;
      if (nameKw && !a.name.toLowerCase().includes(nameKw)) return false;
      if (affiliationKw && !a.affiliation.toLowerCase().includes(affiliationKw)) return false;
      if (idNumberKw && !a.id_number.toLowerCase().includes(idNumberKw)) return false;
      if (phoneKw && !a.phone.toLowerCase().includes(phoneKw)) return false;
      if (emailKw && !a.email.toLowerCase().includes(emailKw)) return false;
      if (columnFilters.certIssued !== "전체") {
        const wantIssued = columnFilters.certIssued === "발급완료";
        if (a.cert_issued !== wantIssued) return false;
      }
      for (const { field } of NOTICE_COLUMNS) {
        const want = noticeFilters[field];
        if (want !== "전체" && (a[field] ?? false) !== (want === "확인")) return false;
      }
      return true;
    });
  }, [applications, roundFilter, search, columnFilters, noticeFilters]);

  function updateColumnFilter<K extends keyof ColumnFilters>(key: K, value: ColumnFilters[K]) {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
  }

  function updateNoticeFilter(field: NoticeField, value: NoticeFilterValue) {
    setNoticeFilters((prev) => ({ ...prev, [field]: value }));
  }

  const hasActiveColumnFilters =
    (Object.keys(columnFilters) as (keyof ColumnFilters)[]).some(
      (key) => columnFilters[key] !== INITIAL_COLUMN_FILTERS[key]
    ) || Object.values(noticeFilters).some((v) => v !== "전체");

  function resetColumnFilters() {
    setColumnFilters(INITIAL_COLUMN_FILTERS);
    setNoticeFilters(buildInitialNoticeFilters());
  }

  function setRowMessage(id: string, message: RowMessage | null) {
    setRowMessages((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }

  async function handleStatusChange(id: string, status: ApplicationStatus) {
    setRowLoading((prev) => ({ ...prev, [id]: true }));
    setRowMessage(id, null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from(TABLES.APPLICATIONS).update({ status }).eq("id", id);
      if (error) {
        setRowMessage(id, { type: "error", text: error.message });
        return;
      }
      setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
      setRowMessage(id, { type: "success", text: `상태가 '${status}'(으)로 변경되었습니다.` });
      router.refresh();
    } finally {
      setRowLoading((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function handleIssueCertificate(id: string) {
    const application = applications.find((a) => a.id === id);
    if (!application) return;

    setRowLoading((prev) => ({ ...prev, [id]: true }));
    setRowMessage(id, null);
    try {
      const supabase = createSupabaseBrowserClient();
      const results = await issueCertificatesForApplications(supabase, [application]);
      const result = results.find((r) => r.applicationId === id);
      if (!result) {
        setRowMessage(id, { type: "error", text: "발급 응답을 확인할 수 없습니다." });
        return;
      }
      if (result.success) {
        setApplications((prev) =>
          prev.map((a) => (a.id === id ? { ...a, cert_issued: true } : a))
        );
        setRowMessage(id, {
          type: "success",
          text: `수료증이 발급되었습니다. (번호: ${result.certNo ?? "-"})`,
          downloadUrl: result.downloadUrl,
        });
        router.refresh();
      } else {
        setRowMessage(id, { type: "error", text: result.error ?? "수료증 발급에 실패했습니다." });
      }
    } catch (err) {
      setRowMessage(id, {
        type: "error",
        text: err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.",
      });
    } finally {
      setRowLoading((prev) => ({ ...prev, [id]: false }));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    const filteredIds = filtered.map((a) => a.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  async function handleBulkIssue() {
    setBulkMessage(null);
    const selectedApplications = applications.filter((a) => selectedIds.has(a.id));
    const eligible = selectedApplications.filter((a) => a.status === "이수");
    const excludedCount = selectedApplications.length - eligible.length;

    if (eligible.length === 0) {
      setBulkMessage({
        type: "error",
        text: "선택한 항목 중 '이수' 상태인 신청 건이 없습니다. 이수처리 후 다시 시도해 주세요.",
      });
      return;
    }

    setBulkLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const results = await issueCertificatesForApplications(supabase, eligible);
      const successIds = new Set(
        results.filter((r) => r.success).map((r) => r.applicationId)
      );
      const failCount = results.length - successIds.size;

      setApplications((prev) =>
        prev.map((a) => (successIds.has(a.id) ? { ...a, cert_issued: true } : a))
      );

      results.forEach((r) => {
        setRowMessage(
          r.applicationId,
          r.success
            ? {
                type: "success",
                text: `수료증이 발급되었습니다. (번호: ${r.certNo ?? "-"})`,
                downloadUrl: r.downloadUrl,
              }
            : { type: "error", text: r.error ?? "수료증 발급에 실패했습니다." }
        );
      });

      const parts: string[] = [];
      if (successIds.size > 0) parts.push(`${successIds.size}건 발급 성공`);
      if (failCount > 0) parts.push(`${failCount}건 발급 실패`);
      if (excludedCount > 0) parts.push(`이수 상태가 아니어서 ${excludedCount}건 제외`);

      setBulkMessage({
        type: failCount > 0 ? "error" : "success",
        text: parts.join(", ") + "되었습니다.",
      });
      router.refresh();
    } catch (err) {
      setBulkMessage({
        type: "error",
        text: err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.",
      });
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkDelete() {
    setBulkMessage(null);
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const ok = window.confirm(
      `선택한 ${ids.length}건의 신청을 삭제할까요?\n삭제하면 해당 신청의 수료증 발급 이력도 함께 삭제되며 되돌릴 수 없습니다.`
    );
    if (!ok) return;

    setDeleteLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from(TABLES.APPLICATIONS).delete().in("id", ids);
      if (error) {
        setBulkMessage({ type: "error", text: `삭제에 실패했습니다: ${error.message}` });
        return;
      }
      setApplications((prev) => prev.filter((a) => !selectedIds.has(a.id)));
      setSelectedIds(new Set());
      setBulkMessage({ type: "success", text: `${ids.length}건이 삭제되었습니다.` });
      router.refresh();
    } catch (err) {
      setBulkMessage({
        type: "error",
        text: err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.",
      });
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleBulkStatusChange() {
    setBulkMessage(null);
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const ok = window.confirm(`선택한 ${ids.length}건의 상태를 '${bulkStatus}'(으)로 변경할까요?`);
    if (!ok) return;

    setStatusLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from(TABLES.APPLICATIONS)
        .update({ status: bulkStatus })
        .in("id", ids);
      if (error) {
        setBulkMessage({ type: "error", text: `상태 변경에 실패했습니다: ${error.message}` });
        return;
      }
      setApplications((prev) =>
        prev.map((a) => (selectedIds.has(a.id) ? { ...a, status: bulkStatus } : a))
      );
      setBulkMessage({
        type: "success",
        text: `${ids.length}건의 상태가 '${bulkStatus}'(으)로 변경되었습니다.`,
      });
      router.refresh();
    } catch (err) {
      setBulkMessage({
        type: "error",
        text: err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.",
      });
    } finally {
      setStatusLoading(false);
    }
  }

  async function handleNoticeToggle(id: string, field: NoticeField, next: boolean) {
    setRowMessage(id, null);
    // 낙관적 갱신 후 실패 시 롤백
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: next } : a)));
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from(TABLES.APPLICATIONS)
      .update({ [field]: next })
      .eq("id", id);
    if (error) {
      setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: !next } : a)));
      setRowMessage(id, { type: "error", text: `안내메세지 확인 저장 실패: ${error.message}` });
    }
  }

  async function handleBulkNoticeConfirmChange() {
    setBulkMessage(null);
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const stageLabel =
      NOTICE_COLUMNS.find((c) => c.field === bulkNoticeStage)?.label ?? bulkNoticeStage;
    const ok = window.confirm(
      `선택한 ${ids.length}건의 '${stageLabel}' 확인을 '${bulkNoticeConfirmed}' 상태로 변경할까요?`
    );
    if (!ok) return;

    const nextValue = bulkNoticeConfirmed === "확인";
    setNoticeLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from(TABLES.APPLICATIONS)
        .update({ [bulkNoticeStage]: nextValue })
        .in("id", ids);
      if (error) {
        setBulkMessage({
          type: "error",
          text: `안내메세지 확인 변경에 실패했습니다: ${error.message}`,
        });
        return;
      }
      setApplications((prev) =>
        prev.map((a) => (selectedIds.has(a.id) ? { ...a, [bulkNoticeStage]: nextValue } : a))
      );
      setBulkMessage({
        type: "success",
        text: `${ids.length}건의 '${stageLabel}' 확인이 '${bulkNoticeConfirmed}' 상태로 변경되었습니다.`,
      });
      router.refresh();
    } catch (err) {
      setBulkMessage({
        type: "error",
        text: err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.",
      });
    } finally {
      setNoticeLoading(false);
    }
  }

  /** 참여자 추가용 회차 목록. 표는 존재하는 신청 건에서만 회차를 뽑으므로 전체 회차를 따로 로드한다. */
  async function loadWorkshopOptions() {
    if (workshopOptions || workshopOptionsLoading) return;
    setWorkshopOptionsLoading(true);
    setWorkshopOptionsError(null);
    try {
      const { workshops, appliedCountByWorkshopId } = await fetchWorkshopsWithAvailability();
      const now = Date.now();
      setWorkshopOptions(
        workshops.map((w) => ({
          id: w.id,
          roundLabel: w.round_label || `${w.round}차`,
          topic: w.topic,
          startAt: w.start_at,
          endAt: w.end_at,
          ...deriveWorkshopStatus(w, appliedCountByWorkshopId.get(w.id) ?? 0, now),
        }))
      );
    } catch (err) {
      setWorkshopOptionsError(
        err instanceof Error ? err.message : "회차 정보를 불러오지 못했습니다."
      );
    } finally {
      setWorkshopOptionsLoading(false);
    }
  }

  function handleOpenDraft() {
    setDraftErrors({});
    setDraftMessage(null);
    setDraft((prev) => prev ?? { ...INITIAL_DRAFT });
    void loadWorkshopOptions();
  }

  function handleCloseDraft() {
    setDraft(null);
    setDraftErrors({});
    setDraftMessage(null);
  }

  function updateDraftField<K extends keyof DraftRow>(key: K, value: DraftRow[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleDraftSave() {
    if (!draft) return;
    setDraftMessage(null);

    const parsed = adminApplicationSchema.safeParse({
      workshopId: draft.workshopId,
      name: draft.name,
      affiliation: draft.affiliation,
      idNumber: draft.idNumber,
      phone: draft.phone,
      email: draft.email,
      consent: draft.consent,
    });

    if (!parsed.success) {
      const fieldErrors: DraftFieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof DraftRow;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setDraftErrors(fieldErrors);
      return;
    }

    setDraftErrors({});

    // 같은 회차에 같은 연락처가 이미 있으면 확인만 받고 진행한다(대리 신청·재등록 여지를 남긴다).
    const phoneKey = normalizePhone(parsed.data.phone);
    const duplicate = applications.find(
      (a) => a.workshop_id === parsed.data.workshopId && normalizePhone(a.phone) === phoneKey
    );
    if (duplicate) {
      const ok = window.confirm(
        `같은 회차에 동일한 연락처로 등록된 신청 건이 이미 있습니다. (${duplicate.name} · ${duplicate.status})\n그래도 등록할까요?`
      );
      if (!ok) return;
    }

    setDraftSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from(TABLES.APPLICATIONS)
        .insert({
          workshop_id: parsed.data.workshopId,
          name: parsed.data.name,
          affiliation: parsed.data.affiliation,
          id_number: parsed.data.idNumber,
          phone: parsed.data.phone,
          email: parsed.data.email,
          consent: parsed.data.consent,
          status: draft.status,
          created_by_admin: true,
        })
        // 표 본문이 a.workshop.*를 가드 없이 참조하므로 임베드까지 함께 받아 온다.
        .select("*, workshop:workshops(*)")
        .returns<ApplicationWithWorkshop[]>()
        .single();

      if (error || !data) {
        setDraftMessage({
          type: "error",
          text: `등록에 실패했습니다: ${error?.message ?? "응답을 확인할 수 없습니다."}`,
        });
        return;
      }

      // PostgREST가 to-one 임베드를 배열로 돌려주는 경우가 있어 페이지와 동일하게 정규화한다.
      const inserted: ApplicationWithWorkshop = {
        ...data,
        workshop: Array.isArray(data.workshop) ? data.workshop[0] : data.workshop,
      };

      // 목록은 created_at 내림차순이므로 맨 앞에 붙인다.
      setApplications((prev) => [inserted, ...prev]);

      // 정원 집계(신청완료·이수)에 포함되는 상태면 잔여 표기를 맞춰 준다.
      if (draft.status === "신청완료" || draft.status === "이수") {
        setWorkshopOptions((prev) =>
          prev
            ? prev.map((w) => {
                if (w.id !== inserted.workshop_id) return w;
                const remaining = w.remaining - 1;
                return { ...w, remaining, isClosed: w.isClosed || remaining <= 0 };
              })
            : prev
        );
      }

      // 연달아 등록할 수 있도록 회차·상태는 유지하고 인적 정보만 비운다.
      setDraft({ ...INITIAL_DRAFT, workshopId: draft.workshopId, status: draft.status });
      // 필터가 걸려 있으면 방금 추가한 행이 목록에서 걸러질 수 있으므로 함께 알린다.
      const filterHint =
        roundFilter !== "전체" || search.trim() !== "" || hasActiveColumnFilters
          ? " (필터 조건에 따라 목록에 보이지 않을 수 있습니다.)"
          : "";
      setDraftMessage({
        type: "success",
        text: `${inserted.name} 참여자가 등록되었습니다. 이어서 추가 등록할 수 있습니다.${filterHint}`,
      });
      router.refresh();
    } catch (err) {
      setDraftMessage({
        type: "error",
        text: err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.",
      });
    } finally {
      setDraftSaving(false);
    }
  }

  function handleExportCsv() {
    exportRowsAsCsv(
      filtered,
      [
        { header: "프로그램명", accessor: (a: ApplicationWithWorkshop) => a.workshop.topic },
        { header: "신청일", accessor: (a: ApplicationWithWorkshop) => formatDateTime(a.created_at) },
        {
          header: "프로그램 일시",
          accessor: (a: ApplicationWithWorkshop) =>
            formatDateRange(a.workshop.start_at, a.workshop.end_at),
        },
        {
          header: "회차",
          accessor: (a: ApplicationWithWorkshop) =>
            a.workshop.round_label || `${a.workshop.round}차`,
        },
        { header: "성명", accessor: (a: ApplicationWithWorkshop) => a.name },
        { header: "소속", accessor: (a: ApplicationWithWorkshop) => a.affiliation },
        { header: "교번/직번/학번/생년월일", accessor: (a: ApplicationWithWorkshop) => a.id_number },
        { header: "연락처", accessor: (a: ApplicationWithWorkshop) => a.phone },
        { header: "이메일", accessor: (a: ApplicationWithWorkshop) => a.email },
        { header: "상태", accessor: (a: ApplicationWithWorkshop) => a.status },
        {
          header: "수료증 발급여부",
          accessor: (a: ApplicationWithWorkshop) => (a.cert_issued ? "발급완료" : "미발급"),
        },
        ...NOTICE_COLUMNS.map(({ field, label }) => ({
          header: `안내메세지 확인 - ${label}`,
          accessor: (a: ApplicationWithWorkshop) => (a[field] ? "확인" : "미확인"),
        })),
      ],
      `신청자관리_${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((a) => selectedIds.has(a.id));

  const hasAdminCreated = applications.some((a) => a.created_by_admin);
  const draftWorkshop = draft
    ? workshopOptions?.find((w) => w.id === draft.workshopId)
    : undefined;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:flex-row sm:flex-wrap sm:items-end sm:gap-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <label htmlFor="round-filter" className="text-xs font-semibold text-slate-600">
            회차
          </label>
          <select
            id="round-filter"
            value={roundFilter}
            onChange={(e) => setRoundFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-accent"
          >
            <option value="전체">전체</option>
            {rounds.map((r) => (
              <option key={r.round} value={String(r.round)}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="status-filter" className="text-xs font-semibold text-slate-600">
            상태
          </label>
          <select
            id="status-filter"
            value={columnFilters.status}
            onChange={(e) => updateColumnFilter("status", e.target.value as StatusFilterValue)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-accent"
          >
            {STATUS_FILTER_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="applicant-search" className="text-xs font-semibold text-slate-600">
            검색(성명/이메일/연락처)
          </label>
          <input
            id="applicant-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="예: 홍길동, 010-1234-5678"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-accent"
          />
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleOpenDraft}
            disabled={
              !!draft || bulkLoading || statusLoading || noticeLoading || deleteLoading
            }
          >
            참여자 추가
          </Button>
          {hasActiveColumnFilters && (
            <Button type="button" variant="outline" size="sm" onClick={resetColumnFilters}>
              표 필터 초기화
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={handleExportCsv}>
            엑셀 내보내기
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleBulkIssue}
            disabled={
              bulkLoading || statusLoading || noticeLoading || deleteLoading || selectedIds.size === 0
            }
          >
            {bulkLoading ? "발급 처리 중..." : "선택 항목 일괄발급"}
          </Button>
          <div className="flex items-center gap-1">
            <select
              aria-label="일괄 변경할 상태"
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as ApplicationStatus)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-accent"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleBulkStatusChange}
              disabled={
                statusLoading || bulkLoading || noticeLoading || deleteLoading || selectedIds.size === 0
              }
            >
              {statusLoading ? "변경 중..." : "선택 항목 상태변경"}
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <select
              aria-label="일괄 변경할 안내메세지 단계"
              value={bulkNoticeStage}
              onChange={(e) => setBulkNoticeStage(e.target.value as NoticeField)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-accent"
            >
              {NOTICE_COLUMNS.map(({ field, label }) => (
                <option key={field} value={field}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="일괄 변경할 안내메세지 확인 상태"
              value={bulkNoticeConfirmed}
              onChange={(e) => setBulkNoticeConfirmed(e.target.value as "확인" | "미확인")}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-accent"
            >
              <option value="확인">확인</option>
              <option value="미확인">미확인</option>
            </select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleBulkNoticeConfirmChange}
              disabled={
                noticeLoading || bulkLoading || statusLoading || deleteLoading || selectedIds.size === 0
              }
            >
              {noticeLoading ? "변경 중..." : "선택 항목 안내확인 변경"}
            </Button>
          </div>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={handleBulkDelete}
            disabled={
              deleteLoading || bulkLoading || statusLoading || noticeLoading || selectedIds.size === 0
            }
          >
            {deleteLoading ? "삭제 중..." : "선택 항목 삭제"}
          </Button>
        </div>
      </div>

      {bulkMessage && (
        <p
          role="alert"
          className={clsx(
            "rounded-lg border px-4 py-3 text-sm font-medium",
            bulkMessage.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-red-300 bg-red-50 text-red-700"
          )}
        >
          {bulkMessage.text}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          총 {filtered.length}건 (전체 {applications.length}건 중), 선택됨 {selectedIds.size}건
        </p>
        {(hasAdminCreated || draft) && (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-6 rounded-sm border-2 border-violet-500 bg-violet-50"
            />
            관리자 등록 건
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card">
        <table className="w-full table-fixed border-collapse text-left text-xs">
          <caption className="sr-only">신청자 목록 및 상태·수료증 관리 테이블</caption>
          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              <th scope="col" rowSpan={2} className="w-8 px-2 py-2 align-bottom">
                <input
                  type="checkbox"
                  aria-label="현재 목록 전체 선택"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAllFiltered}
                />
              </th>
              <th scope="col" rowSpan={2} className="px-2 py-2 align-bottom">
                <div className="flex flex-col gap-1">
                  <span>프로그램명</span>
                  <HeaderTextFilter
                    label="프로그램명"
                    value={columnFilters.topic}
                    onChange={(v) => updateColumnFilter("topic", v)}
                  />
                </div>
              </th>
              <th scope="col" rowSpan={2} className="w-20 px-2 py-2 align-bottom">
                신청일
              </th>
              <th scope="col" rowSpan={2} className="w-28 px-2 py-2 align-bottom">
                프로그램 일시
              </th>
              <th scope="col" rowSpan={2} className="w-20 px-2 py-2 align-bottom">
                <div className="flex flex-col gap-1">
                  <span>성명</span>
                  <HeaderTextFilter
                    label="성명"
                    value={columnFilters.name}
                    onChange={(v) => updateColumnFilter("name", v)}
                  />
                </div>
              </th>
              <th scope="col" rowSpan={2} className="px-2 py-2 align-bottom">
                <div className="flex flex-col gap-1">
                  <span>소속</span>
                  <HeaderTextFilter
                    label="소속"
                    value={columnFilters.affiliation}
                    onChange={(v) => updateColumnFilter("affiliation", v)}
                  />
                </div>
              </th>
              <th scope="col" rowSpan={2} className="w-20 px-2 py-2 align-bottom">
                <div className="flex flex-col gap-1">
                  <span>교번/직번/학번/생년월일</span>
                  <HeaderTextFilter
                    label="교번/직번/학번/생년월일"
                    value={columnFilters.idNumber}
                    onChange={(v) => updateColumnFilter("idNumber", v)}
                  />
                </div>
              </th>
              <th scope="col" rowSpan={2} className="w-24 px-2 py-2 align-bottom">
                <div className="flex flex-col gap-1">
                  <span>연락처</span>
                  <HeaderTextFilter
                    label="연락처"
                    value={columnFilters.phone}
                    onChange={(v) => updateColumnFilter("phone", v)}
                  />
                </div>
              </th>
              <th scope="col" rowSpan={2} className="px-2 py-2 align-bottom">
                <div className="flex flex-col gap-1">
                  <span>이메일</span>
                  <HeaderTextFilter
                    label="이메일"
                    value={columnFilters.email}
                    onChange={(v) => updateColumnFilter("email", v)}
                  />
                </div>
              </th>
              <th scope="col" rowSpan={2} className="w-24 px-2 py-2 align-bottom">
                <div className="flex flex-col gap-1">
                  <span>상태</span>
                  <HeaderSelectFilter
                    label="상태"
                    value={columnFilters.status}
                    onChange={(v) => updateColumnFilter("status", v)}
                    options={STATUS_FILTER_OPTIONS}
                  />
                </div>
              </th>
              <th scope="col" rowSpan={2} className="w-20 px-2 py-2 align-bottom">
                이수처리
              </th>
              <th scope="col" rowSpan={2} className="w-28 px-2 py-2 align-bottom">
                <div className="flex flex-col gap-1">
                  <span>수료증</span>
                  <HeaderSelectFilter
                    label="수료증"
                    value={columnFilters.certIssued}
                    onChange={(v) => updateColumnFilter("certIssued", v)}
                    options={["전체", "발급완료", "미발급"] as const}
                  />
                </div>
              </th>
              <th scope="colgroup" colSpan={3} className="px-1 py-1 text-center">
                안내메세지 확인
              </th>
            </tr>
            <tr>
              {NOTICE_COLUMNS.map(({ field, label }) => (
                <th
                  key={field}
                  scope="col"
                  className="w-16 break-keep px-1 py-1 text-center text-[10px] leading-tight"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span>{label}</span>
                    <HeaderSelectFilter
                      label={label}
                      value={noticeFilters[field]}
                      onChange={(v) => updateNoticeFilter(field, v)}
                      options={["전체", "확인", "미확인"] as const}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {draft && (
              <>
                <tr className={clsx("align-top bg-violet-50", ADMIN_ROW_BORDER_CLASS)}>
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2">
                    <select
                      aria-label="추가할 참여자의 회차"
                      aria-invalid={!!draftErrors.workshopId}
                      value={draft.workshopId}
                      disabled={draftSaving || workshopOptionsLoading}
                      onChange={(e) => updateDraftField("workshopId", e.target.value)}
                      className={DRAFT_INPUT_CLASS}
                    >
                      <option value="">
                        {workshopOptionsLoading ? "회차 불러오는 중..." : "회차 선택"}
                      </option>
                      {(workshopOptions ?? []).map((w) => (
                        <option key={w.id} value={w.id}>
                          {draftWorkshopLabel(w)}
                        </option>
                      ))}
                    </select>
                    {workshopOptionsError && (
                      <p className={DRAFT_ERROR_CLASS}>{workshopOptionsError}</p>
                    )}
                    {draftErrors.workshopId && (
                      <p className={DRAFT_ERROR_CLASS}>{draftErrors.workshopId}</p>
                    )}
                  </td>
                  <td className="px-2 py-2 text-slate-400">자동</td>
                  <td className="break-keep px-2 py-2 text-slate-600">
                    {draftWorkshop
                      ? `${draftWorkshop.roundLabel} · ${formatDateRange(
                          draftWorkshop.startAt,
                          draftWorkshop.endAt
                        )}`
                      : "-"}
                  </td>
                  <DraftTextCell
                    label="성명"
                    value={draft.name}
                    error={draftErrors.name}
                    disabled={draftSaving}
                    onChange={(v) => updateDraftField("name", v)}
                  />
                  <DraftTextCell
                    label="소속"
                    value={draft.affiliation}
                    error={draftErrors.affiliation}
                    disabled={draftSaving}
                    onChange={(v) => updateDraftField("affiliation", v)}
                  />
                  <DraftTextCell
                    label="교번/직번/학번/생년월일"
                    value={draft.idNumber}
                    error={draftErrors.idNumber}
                    disabled={draftSaving}
                    onChange={(v) => updateDraftField("idNumber", v)}
                  />
                  <DraftTextCell
                    label="연락처"
                    type="tel"
                    placeholder="010-1234-5678"
                    value={draft.phone}
                    error={draftErrors.phone}
                    disabled={draftSaving}
                    onChange={(v) => updateDraftField("phone", v)}
                  />
                  <DraftTextCell
                    label="이메일"
                    type="email"
                    placeholder="선택(모르면 비움)"
                    value={draft.email}
                    error={draftErrors.email}
                    disabled={draftSaving}
                    onChange={(v) => updateDraftField("email", v)}
                  />
                  <td className="px-2 py-2">
                    <select
                      aria-label="추가할 참여자의 상태"
                      value={draft.status}
                      disabled={draftSaving}
                      onChange={(e) =>
                        updateDraftField("status", e.target.value as ApplicationStatus)
                      }
                      className={DRAFT_INPUT_CLASS}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td colSpan={5} className="px-2 py-2">
                    <div className="flex flex-col gap-2">
                      <label className="flex items-start gap-1.5 text-[11px] font-medium leading-tight text-slate-700">
                        <input
                          type="checkbox"
                          checked={draft.consent}
                          disabled={draftSaving}
                          aria-invalid={!!draftErrors.consent}
                          onChange={(e) => updateDraftField("consent", e.target.checked)}
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-accent focus:ring-accent"
                        />
                        <span>개인정보 수집·이용 동의를 받았음을 확인합니다. (필수)</span>
                      </label>
                      {draftErrors.consent && (
                        <p className={DRAFT_ERROR_CLASS}>{draftErrors.consent}</p>
                      )}
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={draftSaving}
                          onClick={handleDraftSave}
                        >
                          {draftSaving ? "저장 중..." : "저장"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={draftSaving}
                          onClick={handleCloseDraft}
                        >
                          닫기
                        </Button>
                      </div>
                    </div>
                  </td>
                </tr>
                {draftMessage && (
                  <tr>
                    <td colSpan={15} className="px-3 py-2">
                      <p
                        role="alert"
                        className={clsx(
                          "text-xs font-medium",
                          draftMessage.type === "success" ? "text-emerald-700" : "text-red-600"
                        )}
                      >
                        {draftMessage.text}
                      </p>
                    </td>
                  </tr>
                )}
              </>
            )}
            {filtered.map((a) => {
              const isLoading = !!rowLoading[a.id];
              const message = rowMessages[a.id];
              return (
                <tr
                  key={a.id}
                  className={clsx(
                    "align-top",
                    a.created_by_admin && `bg-violet-50/50 ${ADMIN_ROW_BORDER_CLASS}`
                  )}
                >
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      aria-label={`${a.name} 신청 건 선택`}
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggleSelect(a.id)}
                    />
                  </td>
                  <td className="break-keep px-2 py-2 text-slate-700">{a.workshop.topic}</td>
                  <td className="px-2 py-2 text-slate-700">{formatDateTime(a.created_at)}</td>
                  <td className="px-2 py-2 text-slate-700">
                    {a.workshop.round_label || `${a.workshop.round}차`} ·{" "}
                    {formatDateRange(a.workshop.start_at, a.workshop.end_at)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 font-semibold text-slate-800">
                    {a.name}
                  </td>
                  <td className="break-keep px-2 py-2 text-slate-700">{a.affiliation}</td>
                  <td className="break-all px-2 py-2 text-slate-700">{a.id_number}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-slate-700">{a.phone}</td>
                  <td className="break-all px-2 py-2 text-slate-700">{a.email}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-2">
                      <StatusBadge status={a.status} />
                      <select
                        aria-label={`${a.name} 신청 건 상태 변경`}
                        value={a.status}
                        disabled={isLoading}
                        onChange={(e) =>
                          handleStatusChange(a.id, e.target.value as ApplicationStatus)
                        }
                        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs focus:border-accent"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      type="button"
                      variant={a.status === "이수" ? "secondary" : "outline"}
                      size="sm"
                      disabled={isLoading || a.status === "이수"}
                      aria-label={`${a.name} 신청 건 이수처리`}
                      onClick={() => handleStatusChange(a.id, "이수")}
                    >
                      이수처리
                    </Button>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-2">
                      <BoolBadge value={a.cert_issued} trueLabel="발급완료" falseLabel="미발급" />
                      {a.status === "이수" && (
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={isLoading}
                          aria-label={
                            a.cert_issued
                              ? `${a.name} 신청 건 수료증 재발급`
                              : `${a.name} 신청 건 수료증 발급`
                          }
                          onClick={() => handleIssueCertificate(a.id)}
                        >
                          {isLoading ? "처리 중..." : a.cert_issued ? "재발급" : "수료증 발급"}
                        </Button>
                      )}
                      {message && (
                        <p
                          role="alert"
                          className={clsx(
                            "text-xs font-medium",
                            message.type === "success" ? "text-emerald-700" : "text-red-600"
                          )}
                        >
                          {message.text}
                        </p>
                      )}
                      {message?.downloadUrl && (
                        <a
                          href={message.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          download
                          className="text-xs font-semibold text-accent underline underline-offset-2"
                        >
                          PDF 다운로드
                        </a>
                      )}
                    </div>
                  </td>
                  {NOTICE_COLUMNS.map(({ field, label }) => (
                    <td key={field} className="px-1 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${a.name} ${label} 확인 여부`}
                        checked={a[field] ?? false}
                        onChange={(e) => handleNoticeToggle(a.id, field, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
            {filtered.length === 0 && !draft && (
              <tr>
                <td colSpan={15} className="px-3 py-8 text-center text-sm text-slate-500">
                  조건에 맞는 신청 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
