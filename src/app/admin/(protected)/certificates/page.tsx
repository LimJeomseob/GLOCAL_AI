"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-tables";
import type { CertificateWithApplication } from "@/lib/types";
import { CertificateLedgerView } from "@/components/admin/CertificateLedgerView";

export default function AdminCertificatesPage() {
  const [certificates, setCertificates] = useState<CertificateWithApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();

    async function load() {
      const certificatesRes = await supabase
        .from(TABLES.CERTIFICATES)
        // workshops(*)로 조회해 round_label 컬럼 추가 마이그레이션(0007) 적용 전후 모두 동작하게 한다.
        .select("*, application:applications(id, name, affiliation, status, workshop:workshops(*))")
        // 대장의 연번이 실제 발급 순서와 일치하도록 발급일시 오름차순. 발급번호 문자열은
        // 0006 이전 레거시 형식(AI-2026-…)이 섞일 수 있어 정렬 기준으로 쓰지 않는다.
        .order("issued_at", { ascending: true })
        .returns<CertificateWithApplication[]>();

      if (!active) return;

      if (certificatesRes.error) {
        setError("데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
        return;
      }

      // PostgREST가 to-one 임베드를 스키마 캐시 상태에 따라 배열로 반환하는 경우가 있어,
      // 화면 컴포넌트가 항상 객체 형태를 받도록 두 단계(application, workshop) 모두 정규화한다.
      const normalizedCertificates: CertificateWithApplication[] = (
        certificatesRes.data ?? []
      ).map((row) => {
        const application = Array.isArray(row.application) ? row.application[0] : row.application;
        return {
          ...row,
          application: application
            ? {
                ...application,
                workshop: Array.isArray(application.workshop)
                  ? application.workshop[0]
                  : application.workshop,
              }
            : null,
        };
      });

      setCertificates(normalizedCertificates);
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-bold text-brand sm:text-2xl">수료증 발급대장</h1>
        <p className="mt-1 text-sm text-slate-500">
          발급된 수료증의 발급번호·발급일자·발급경로를 확인하고 대장을 내보낼 수 있습니다. 수료증
          발급은 신청자 관리 화면에서 진행합니다.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!error && !certificates && (
        <p role="status" className="text-sm text-slate-500">
          수료증 발급대장을 불러오는 중...
        </p>
      )}

      {certificates && <CertificateLedgerView initialCertificates={certificates} />}
    </div>
  );
}
