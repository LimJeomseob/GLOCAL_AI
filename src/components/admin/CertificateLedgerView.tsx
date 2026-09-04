"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CERTIFICATES_BUCKET } from "@/lib/db-tables";
import { formatCertPeriod, formatDateTime } from "@/lib/format";
import { exportRowsAsCsv } from "@/lib/csv";
import { Button } from "@/components/ui/Button";
import type { CertificateWithApplication } from "@/lib/types";

type ChannelFilterValue = "전체" | "admin" | "public";

const CHANNEL_LABELS: Record<CertificateWithApplication["issued_channel"], string> = {
  admin: "관리자 발급",
  public: "본인 발급",
};

const ALL_ROUNDS = "전체";

/** 회차 라벨(0007 이전 데이터는 round_label이 비어 있을 수 있어 "N차"로 보완). */
function roundLabelOf(cert: CertificateWithApplication): string {
  const workshop = cert.application?.workshop;
  if (!workshop) return "-";
  return workshop.round_label || `${workshop.round}차`;
}

function courseLabelOf(cert: CertificateWithApplication): string {
  const workshop = cert.application?.workshop;
  if (!workshop) return "-";
  return `${roundLabelOf(cert)} · ${workshop.topic}`;
}

function periodOf(cert: CertificateWithApplication): string {
  const workshop = cert.application?.workshop;
  if (!workshop) return "-";
  return formatCertPeriod(workshop.start_at, workshop.end_at);
}

/** 재발급 이력 표기: 0회면 "-", 그 외에는 횟수와 최종 재발급(updated_at) 시각. */
function reissueLabelOf(cert: CertificateWithApplication): string {
  if (cert.reissue_count <= 0) return "-";
  return `${cert.reissue_count}회 (${formatDateTime(cert.updated_at)})`;
}

export function CertificateLedgerView({
  initialCertificates,
}: {
  initialCertificates: CertificateWithApplication[];
}) {
  const certificates = initialCertificates;

  const [roundFilter, setRoundFilter] = useState<string>(ALL_ROUNDS);
  const [channelFilter, setChannelFilter] = useState<ChannelFilterValue>("전체");
  const [search, setSearch] = useState("");
  const [rowLoading, setRowLoading] = useState<Record<string, boolean>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const roundOptions = useMemo(() => {
    const map = new Map<string, number>();
    certificates.forEach((cert) => {
      const workshop = cert.application?.workshop;
      if (!workshop) return;
      map.set(roundLabelOf(cert), workshop.round);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([label]) => label);
  }, [certificates]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return certificates.filter((cert) => {
      if (roundFilter !== ALL_ROUNDS && roundLabelOf(cert) !== roundFilter) return false;
      if (channelFilter !== "전체" && cert.issued_channel !== channelFilter) return false;
      if (!keyword) return true;
      const haystack = [
        cert.cert_no,
        cert.application?.name ?? "",
        cert.application?.affiliation ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [certificates, roundFilter, channelFilter, search]);

  const hasActiveFilters =
    roundFilter !== ALL_ROUNDS || channelFilter !== "전체" || search.trim() !== "";

  const reissuedCount = certificates.filter((c) => c.reissue_count > 0).length;
  const missingPdfCount = certificates.filter((c) => !c.pdf_path).length;

  function resetFilters() {
    setRoundFilter(ALL_ROUNDS);
    setChannelFilter("전체");
    setSearch("");
  }

  /**
   * 보관된 수료증 PDF를 내려받는다. 비공개 버킷이라 클릭 시점에 10분짜리 서명 URL을 새로 만들고,
   * download 옵션으로 첨부파일 응답을 받아 임시 <a>로 즉시 저장한다(새 창을 열지 않아 팝업 차단과 무관).
   */
  async function handleDownloadPdf(cert: CertificateWithApplication) {
    if (!cert.pdf_path) return;

    setRowLoading((prev) => ({ ...prev, [cert.id]: true }));
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[cert.id];
      return next;
    });

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.storage
        .from(CERTIFICATES_BUCKET)
        .createSignedUrl(cert.pdf_path, 600, { download: true });

      if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? "다운로드 링크를 만들 수 없습니다.");
      }

      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [cert.id]: err instanceof Error ? err.message : "PDF를 내려받지 못했습니다.",
      }));
    } finally {
      setRowLoading((prev) => ({ ...prev, [cert.id]: false }));
    }
  }

  /** 화면에 보이는(필터 적용된) 대장을 그대로 내보낸다. 연번은 표와 동일한 표시 순번이다. */
  function handleExportCsv() {
    const rowNumbers = new Map(filtered.map((c, idx) => [c.id, idx + 1]));

    exportRowsAsCsv(
      filtered,
      [
        { header: "연번", accessor: (c: CertificateWithApplication) => rowNumbers.get(c.id) },
        { header: "발급번호", accessor: (c: CertificateWithApplication) => c.cert_no },
        { header: "성명", accessor: (c: CertificateWithApplication) => c.application?.name ?? "-" },
        {
          header: "소속",
          accessor: (c: CertificateWithApplication) => c.application?.affiliation ?? "-",
        },
        { header: "교육과정", accessor: (c: CertificateWithApplication) => courseLabelOf(c) },
        { header: "교육기간", accessor: (c: CertificateWithApplication) => periodOf(c) },
        { header: "발급일자", accessor: (c: CertificateWithApplication) => formatDateTime(c.issued_at) },
        {
          header: "발급구분",
          accessor: (c: CertificateWithApplication) => CHANNEL_LABELS[c.issued_channel],
        },
        {
          header: "재발급",
          // 표의 "-" 대신 "0회"로 내보낸다. CSV 셀이 "-"로 시작하면 수식 인젝션 가드가
          // 작은따옴표를 덧붙여(`'-`) 엑셀에서 지저분하게 보이기 때문이다.
          accessor: (c: CertificateWithApplication) =>
            c.reissue_count > 0 ? reissueLabelOf(c) : "0회",
        },
        { header: "발급자", accessor: (c: CertificateWithApplication) => c.issuer },
        {
          header: "수료증 PDF",
          accessor: (c: CertificateWithApplication) => (c.pdf_path ? "보관" : "미보관"),
        },
      ],
      `수료증발급대장_${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:flex-row sm:items-center sm:p-6">
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <dt className="text-sm font-semibold text-slate-600">총 발급 건수</dt>
            <dd className="text-2xl font-bold text-brand">{certificates.length}건</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-slate-600">재발급 이력</dt>
            <dd className="text-2xl font-bold text-brand">{reissuedCount}건</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-slate-600">PDF 미보관</dt>
            <dd
              className={clsx(
                "text-2xl font-bold",
                missingPdfCount > 0 ? "text-red-600" : "text-brand"
              )}
            >
              {missingPdfCount}건
            </dd>
          </div>
        </dl>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={filtered.length === 0}
        >
          대장 CSV 내보내기
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:flex-row sm:flex-wrap sm:items-end sm:gap-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <label htmlFor="cert-round-filter" className="text-xs font-semibold text-slate-600">
            회차
          </label>
          <select
            id="cert-round-filter"
            value={roundFilter}
            onChange={(e) => setRoundFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-accent"
          >
            <option value={ALL_ROUNDS}>전체</option>
            {roundOptions.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="cert-channel-filter" className="text-xs font-semibold text-slate-600">
            발급구분
          </label>
          <select
            id="cert-channel-filter"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as ChannelFilterValue)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-accent"
          >
            <option value="전체">전체</option>
            <option value="admin">{CHANNEL_LABELS.admin}</option>
            <option value="public">{CHANNEL_LABELS.public}</option>
          </select>
        </div>

        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="cert-search" className="text-xs font-semibold text-slate-600">
            검색(성명/소속/발급번호)
          </label>
          <input
            id="cert-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="예: 홍길동, 제2026-001호"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-accent"
          />
        </div>

        {hasActiveFilters && (
          <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
            필터 초기화
          </Button>
        )}
      </div>

      <p className="text-sm text-slate-500">
        총 {filtered.length}건 (전체 {certificates.length}건 중)
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card">
        <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
          <caption className="sr-only">
            수료증 발급대장. 연번은 화면 표시 순번이며, 공식 번호는 발급번호 열입니다.
          </caption>
          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              <th scope="col" className="px-3 py-3">
                연번
              </th>
              <th scope="col" className="px-3 py-3">
                발급번호
              </th>
              <th scope="col" className="px-3 py-3">
                성명
              </th>
              <th scope="col" className="px-3 py-3">
                소속
              </th>
              <th scope="col" className="px-3 py-3">
                교육과정
              </th>
              <th scope="col" className="px-3 py-3">
                교육기간
              </th>
              <th scope="col" className="px-3 py-3">
                발급일자
              </th>
              <th scope="col" className="px-3 py-3">
                발급구분
              </th>
              <th scope="col" className="px-3 py-3">
                재발급
              </th>
              <th scope="col" className="px-3 py-3">
                수료증 PDF
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((cert, idx) => (
              <tr key={cert.id} className="align-top">
                <td className="px-3 py-3 text-slate-500">{idx + 1}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-800">
                  {cert.cert_no}
                </td>
                <td className="px-3 py-3 font-semibold text-slate-800">
                  {cert.application?.name ?? "-"}
                </td>
                <td className="px-3 py-3 text-slate-700 break-keep">
                  {cert.application?.affiliation ?? "-"}
                </td>
                <td className="px-3 py-3 text-slate-700 break-keep">{courseLabelOf(cert)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-700">{periodOf(cert)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                  {formatDateTime(cert.issued_at)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                  {CHANNEL_LABELS[cert.issued_channel]}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                  {reissueLabelOf(cert)}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col items-start gap-1">
                    {cert.pdf_path ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadPdf(cert)}
                        disabled={rowLoading[cert.id]}
                      >
                        {rowLoading[cert.id] ? "준비 중..." : "PDF 다운로드"}
                      </Button>
                    ) : (
                      <span
                        title="발급 기록은 있으나 수료증 파일이 저장되지 않았습니다. 신청자 관리 화면에서 재발급하면 파일이 다시 저장됩니다."
                        className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600"
                      >
                        미보관
                      </span>
                    )}
                    {rowErrors[cert.id] && (
                      <p role="alert" className="text-xs font-medium text-red-600">
                        {rowErrors[cert.id]}
                      </p>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-sm text-slate-500">
                  {certificates.length === 0
                    ? "아직 발급된 수료증이 없습니다."
                    : "조건에 맞는 발급 내역이 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
