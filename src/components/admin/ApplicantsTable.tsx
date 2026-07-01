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
      filtered,
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

        <div className="flex gap-2">
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
        <table className="w-full min-w-[1400px] border-collapse text-left text-sm">
          <caption className="sr-only">신청자 목록 및 상태·수료증 관리 테이블</caption>
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
              <th scope="col" className="px-3 py-3">
                프로그램명
              </th>
              <th scope="col" className="px-3 py-3">
                신청일
              </th>
              <th scope="col" className="px-3 py-3">
                프로그램 일시
              </th>
              <th scope="col" className="px-3 py-3">
                성명
              </th>
              <th scope="col" className="px-3 py-3">
                소속
              </th>
              <th scope="col" className="px-3 py-3">
                교번/직번/학번/생년월일
              </th>
              <th scope="col" className="px-3 py-3">
                연락처
              </th>
              <th scope="col" className="px-3 py-3">
                이메일
              </th>
              <th scope="col" className="px-3 py-3">
                상태
              </th>
              <th scope="col" className="px-3 py-3">
                이수처리
              </th>
              <th scope="col" className="px-3 py-3">
                수료증
              </th>
              <th scope="col" className="px-3 py-3">
                관리자 신청
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((a) => {
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
                  <td className="px-3 py-3 text-slate-700">{PROGRAM_NAME}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                    {formatDateTime(a.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                    {a.workshop.round}차 · {formatDateRange(a.workshop.start_at, a.workshop.end_at)}
                  </td>
                  <td className="px-3 py-3 font-semibold text-slate-800">{a.name}</td>
                  <td className="px-3 py-3 text-slate-700">{a.affiliation}</td>
                  <td className="px-3 py-3 text-slate-700">{a.id_number}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{a.phone}</td>
                  <td className="px-3 py-3 text-slate-700">{a.email}</td>
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
                    <BoolBadge value={a.created_by_admin} trueLabel="관리자 신청" falseLabel="본인 신청" />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-sm text-slate-500">
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
