"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-tables";
import type { SurveyResponse } from "@/lib/types";
import { SurveyResultsView } from "@/components/admin/SurveyResultsView";

export default function AdminSurveyPage() {
  const [responses, setResponses] = useState<SurveyResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();

    async function load() {
      const { data, error: fetchError } = await supabase
        .from(TABLES.SURVEY)
        .select("*")
        .order("submitted_at", { ascending: false })
        .returns<SurveyResponse[]>();

      if (!active) return;

      if (fetchError) {
        setError("설문 응답을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
        return;
      }

      setResponses(data ?? []);
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-bold text-brand sm:text-2xl">만족도 설문결과</h1>
        <p className="mt-1 text-sm text-slate-500">
          만족도조사 응답을 집계·시각화하고, 원천 데이터를 확인하거나 CSV로 내보낼 수 있습니다.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!error && !responses && (
        <p role="status" className="text-sm text-slate-500">
          설문 응답을 불러오는 중...
        </p>
      )}

      {responses && <SurveyResultsView initialResponses={responses} />}
    </div>
  );
}
