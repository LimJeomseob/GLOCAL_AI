"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-tables";
import type { ApplicationWithWorkshop } from "@/lib/types";
import { ApplicantsTable } from "@/components/admin/ApplicantsTable";

export default function AdminApplicantsPage() {
  const [applications, setApplications] = useState<ApplicationWithWorkshop[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();

    async function load() {
      const applicationsRes = await supabase
        .from(TABLES.APPLICATIONS)
        // workshops(*)로 조회해 round_label 컬럼 추가 마이그레이션(0007) 적용 전후 모두 동작하게 한다.
        .select("*, workshop:workshops(*)")
        .order("created_at", { ascending: false })
        .returns<ApplicationWithWorkshop[]>();

      if (!active) return;

      if (applicationsRes.error) {
        setError("데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
        return;
      }

      // PostgREST가 to-one 임베드(workshop:workshops(...))를 스키마 캐시 상태에 따라
      // 배열로 반환하는 경우가 있어, 클라이언트 컴포넌트들이 항상 객체 형태를 받도록 여기서 정규화한다.
      const normalizedApplications: ApplicationWithWorkshop[] = (applicationsRes.data ?? []).map(
        (row) => ({
          ...row,
          workshop: Array.isArray(row.workshop) ? row.workshop[0] : row.workshop,
        })
      );

      setApplications(normalizedApplications);
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-bold text-brand sm:text-2xl">신청자 관리</h1>
        <p className="mt-1 text-sm text-slate-500">
          전체 신청자 목록을 확인하고 상태 변경, 이수처리, 수료증 발급을 진행할 수 있습니다.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!error && !applications && (
        <p role="status" className="text-sm text-slate-500">
          신청자 목록을 불러오는 중...
        </p>
      )}

      {applications && <ApplicantsTable initialApplications={applications} />}
    </div>
  );
}
