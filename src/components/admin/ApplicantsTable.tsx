"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-tables";
import { PROGRAM_NAME } from "@/lib/constants";
import { formatDateTime, formatDateRange } from "@/lib/format";
import { exportRowsAsCsv } from "@/lib/csv";
import { issueCertificatesForApplications } from "@/lib/issueCertificate";
import { fetchWorkshopsWithAvailability } from "@/lib/workshops";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AddApplicantModal, CsvImportModal } from "@/components/admin/ApplicantEditModals";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type ApplicationWithWorkshop,
  type Workshop,
} from "@/lib/types";

const STATUS_OPTIONS = APPLICATION_STATUSES;

type SortKey = "program" | "affiliation" | "status";
type SortDir = "asc" | "desc";

interface SortState {
  key: SortKey;
  dir: SortDir;
}

/** 정렬 가능한 헤더 셀: 클릭 시 오름차순 → 내림차순 → 해제 순환 */
function SortableTh({
  label,
  sortKey,
  sortState,
  onToggle,
}: {
  label: string;
  sortKey: SortKey;
  sortState: SortState | null;
  onToggle: (key: SortKey) => void;
}) {
  const active = sortState?.key === sortKey;
  const dir = active ? sortState.dir : null;
  return (
    <th
      scope="col"
      className="px-3 py-3"
      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={clsx(
          "inline-flex items-center gap-1 font-semibold hover:text-brand",
          active ? "text-brand" : "text-slate-600"
        )}
        aria-label={`${label} 기준 정렬`}
      >
        {label}
        <span aria-hidden="true" className={clsx("text-[10px]", !active && "text-slate-400")}>
          {dir === "asc" ? "▲" : dir === "desc" ? "▼" : "↕"}
        </span>
      </button>
    </th>
  );
}

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

export function ApplicantsTable({
  initialApplications,
}: {
  initialApplications: ApplicationWithWorkshop[];
}) {
  const router = useRouter();
  const [applications, setApplications] = useState<ApplicationWithWorkshop[]>(initialApplications);
  const [roundFilter, setRoundFilter] = useState<string>("전체");
  const [statusFilter, setStatusFilter] = useState<string>("전체");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rowMessages, setRowMessages] = useState<Record<string, RowMessage>>({});
  const [rowLoading, setRowLoading] = useState<Record<string, boolean>>({});
  const [bulkMessage, setBulkMessage] = useState<RowMessage | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApplicationWithWorkshop | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // 수동 추가/CSV 모달의 회차 select용. 모달 최초 오픈 시 1회 로드 후 캐시.
  const [workshops, setWorkshops] = useState<Workshop[] | null>(null);
  const [workshopsError, setWorkshopsError] = useState<string | null>(null);

  const rounds = useMemo(() => {
    const set = new Set<number>();
    applications.forEach((a) => set.add(a.workshop.round));
    return Array.from(set).sort((a, b) => a - b);
  }, [applications]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return applications.filter((a) => {
      if (roundFilter !== "전체" && String(a.workshop.round) !== roundFilter) return false;
      if (statusFilter !== "전체" && a.status !== statusFilter) return false;
      if (keyword) {
        const haystack = `${a.name} ${a.email} ${a.phone}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });
  }, [applications, roundFilter, statusFilter, search]);

  const sorted = useMemo(() => {
    if (!sortState) return filtered;
    const { key, dir } = sortState;
    const sign = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (key === "program") cmp = a.workshop.round - b.workshop.round;
      else if (key === "affiliation") cmp = a.affiliation.localeCompare(b.affiliation, "ko");
      else cmp = APPLICATION_STATUSES.indexOf(a.status) - APPLICATION_STATUSES.indexOf(b.status);
      return cmp * sign;
    });
  }, [filtered, sortState]);

  function toggleSort(key: SortKey) {
    setSortState((prev) => {
      if (prev?.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  /** 수동 추가/CSV 모달용 회차 목록을 로드(최초 1회, 실패 시 재시도 가능) */
  async function ensureWorkshops() {
    if (workshops) return;
    setWorkshopsError(null);
    try {
      const { workshops: list } = await fetchWorkshopsWithAvailability();
      setWorkshops(list);
    } catch {
      setWorkshopsError("회차 정보를 불러오지 못했습니다. 모달을 닫고 다시 시도해 주세요.");
    }
  }

  function openAddModal() {
    setAddOpen(true);
    void ensureWorkshops();
  }

  function openImportModal() {
    setImportOpen(true);
    void ensureWorkshops();
  }

  function handleAdded(application: ApplicationWithWorkshop) {
    setApplications((prev) => [application, ...prev]);
    setBulkMessage({ type: "success", text: `${application.name}님 신청 건이 추가되었습니다.` });
    router.refresh();
  }

  function handleImported(imported: ApplicationWithWorkshop[]) {
    setApplications((prev) => [...imported, ...prev]);
    setBulkMessage({ type: "success", text: `CSV에서 ${imported.length}건이 추가되었습니다.` });
    router.refresh();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from(TABLES.APPLICATIONS)
        .delete()
        .eq("id", deleteTarget.id);
      if (error) {
        setDeleteError(error.message);
        return;
      }
      const deletedId = deleteTarget.id;
      setApplications((prev) => prev.filter((a) => a.id !== deletedId));
      setSelectedIds((prev) => {
        if (!prev.has(deletedId)) return prev;
        const next = new Set(prev);
        next.delete(deletedId);
        return next;
      });
      setRowMessage(deletedId, null);
      setBulkMessage({ type: "success", text: `${deleteTarget.name}님 신청 건이 삭제되었습니다.` });
      setDeleteTarget(null);
      router.refresh();
    } finally {
      setDeleteLoading(false);
    }
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

  function handleExportCsv() {
    exportRowsAsCsv(
      sorted,
      [
        { header: "프로그램명", accessor: () => PROGRAM_NAME },
        { header: "신청일", accessor: (a: ApplicationWithWorkshop) => formatDateTime(a.created_at) },
        {
          header: "프로그램 일시",
          accessor: (a: ApplicationWithWorkshop) =>
            formatDateRange(a.workshop.start_at, a.workshop.end_at),
        },
        { header: "회차", accessor: (a: ApplicationWithWorkshop) => a.workshop.round },
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
        {
          header: "관리자에 의한 신청",
          accessor: (a: ApplicationWithWorkshop) => (a.created_by_admin ? "예" : "아니오"),
        },
      ],
      `신청자관리_${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((a) => selectedIds.has(a.id));

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
              <option key={r} value={String(r)}>
                {r}차
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-accent"
          >
            <option value="전체">전체</option>
            {STATUS_OPTIONS.map((s) => (
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

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="primary" size="sm" onClick={openAddModal}>
            신청자 추가
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={openImportModal}>
            CSV 일괄 추가
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleExportCsv}>
            엑셀 내보내기
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleBulkIssue}
            disabled={bulkLoading || selectedIds.size === 0}
          >
            {bulkLoading ? "발급 처리 중..." : "선택 항목 일괄발급"}
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

      <p className="text-sm text-slate-500">
        총 {filtered.length}건 (전체 {applications.length}건 중), 선택됨 {selectedIds.size}건
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card">
        <table className="w-full min-w-[1720px] table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">신청자 목록 및 상태·수료증 관리 테이블</caption>
          <colgroup>
            <col className="w-11" />
            <col className="w-[170px]" />
            <col className="w-[140px]" />
            <col className="w-[230px]" />
            <col className="w-[90px]" />
            <col className="w-[170px]" />
            <col className="w-[130px]" />
            <col className="w-[130px]" />
            <col className="w-[190px]" />
            <col className="w-[110px]" />
            <col className="w-[96px]" />
            <col className="w-[150px]" />
            <col className="w-[80px]" />
          </colgroup>
          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              <th scope="col" className="px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="현재 목록 전체 선택"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAllFiltered}
                />
              </th>
              <SortableTh
                label="프로그램명"
                sortKey="program"
                sortState={sortState}
                onToggle={toggleSort}
              />
              <th scope="col" className="px-3 py-3">
                신청일
              </th>
              <th scope="col" className="px-3 py-3">
                프로그램 일시
              </th>
              <th scope="col" className="px-3 py-3">
                성명
              </th>
              <SortableTh
                label="소속"
                sortKey="affiliation"
                sortState={sortState}
                onToggle={toggleSort}
              />
              <th scope="col" className="px-3 py-3">
                교번/직번/학번/생년월일
              </th>
              <th scope="col" className="px-3 py-3">
                연락처
              </th>
              <th scope="col" className="px-3 py-3">
                이메일
              </th>
              <SortableTh
                label="상태"
                sortKey="status"
                sortState={sortState}
                onToggle={toggleSort}
              />
              <th scope="col" className="px-3 py-3">
                이수처리
              </th>
              <th scope="col" className="px-3 py-3">
                수료증
              </th>
              <th scope="col" className="px-3 py-3">
                관리
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((a) => {
              const isLoading = !!rowLoading[a.id];
              const message = rowMessages[a.id];
              return (
                <tr key={a.id} className="align-top">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={`${a.name} 신청 건 선택`}
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggleSelect(a.id)}
                    />
                  </td>
                  <td className="truncate px-3 py-3 text-slate-700" title={PROGRAM_NAME}>
                    {PROGRAM_NAME}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                    {formatDateTime(a.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                    {a.workshop.round}차 · {formatDateRange(a.workshop.start_at, a.workshop.end_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-800">
                    {a.name}
                  </td>
                  <td className="truncate px-3 py-3 text-slate-700" title={a.affiliation}>
                    {a.affiliation}
                  </td>
                  <td className="truncate px-3 py-3 text-slate-700" title={a.id_number}>
                    {a.id_number}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{a.phone}</td>
                  <td className="truncate px-3 py-3 text-slate-700" title={a.email}>
                    {a.email}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-2">
                      <StatusBadge status={a.status} />
                      <select
                        aria-label={`${a.name} 신청 건 상태 변경`}
                        value={a.status}
                        disabled={isLoading}
                        onChange={(e) =>
                          handleStatusChange(a.id, e.target.value as ApplicationStatus)
                        }
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs focus:border-accent"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-3">
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
                  <td className="px-3 py-3">
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
                  <td className="px-3 py-3">
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={isLoading}
                      aria-label={`${a.name} 신청 건 삭제`}
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(a);
                      }}
                    >
                      삭제
                    </Button>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-sm text-slate-500">
                  조건에 맞는 신청 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 삭제 확인 모달 */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => {
          if (!deleteLoading) setDeleteTarget(null);
        }}
        titleId="delete-applicant-title"
      >
        <h2 id="delete-applicant-title" className="text-lg font-bold text-red-700">
          신청 건 삭제
        </h2>
        {deleteTarget && (
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            <strong>{deleteTarget.name}</strong>님의{" "}
            <strong>{deleteTarget.workshop.round}차</strong> 신청 건을 삭제할까요?
          </p>
        )}
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
          삭제하면 되돌릴 수 없으며, 해당 신청 건의 수료증 발급 내역과 알림 발송 이력도 함께
          삭제됩니다.
        </p>
        {deleteError && (
          <p role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {deleteError}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setDeleteTarget(null)}
            disabled={deleteLoading}
          >
            취소
          </Button>
          <Button type="button" variant="danger" onClick={handleDelete} disabled={deleteLoading}>
            {deleteLoading ? "삭제 중..." : "삭제"}
          </Button>
        </div>
      </Modal>

      <AddApplicantModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        workshops={workshops}
        workshopsError={workshopsError}
        onAdded={handleAdded}
      />

      <CsvImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        workshops={workshops}
        workshopsError={workshopsError}
        onImported={handleImported}
      />
    </section>
  );
}
