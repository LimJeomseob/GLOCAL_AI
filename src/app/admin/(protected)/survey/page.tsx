import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TABLES } from "@/lib/db-tables";
import type { SurveyResponse } from "@/lib/types";
import { SurveyResultsView } from "@/components/admin/SurveyResultsView";

export const dynamic = "force-dynamic";

export default async function AdminSurveyPage() {
  const supabase = createSupabaseServerClient();

  const { data: responses } = await supabase
    .from(TABLES.SURVEY)
    .select("*")
    .order("submitted_at", { ascending: false })
    .returns<SurveyResponse[]>();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-bold text-brand sm:text-2xl">만족도 설문결과</h1>
        <p className="mt-1 text-sm text-slate-500">
          만족도조사 응답을 집계·시각화하고, 원천 데이터를 확인하거나 CSV로 내보낼 수 있습니다.
        </p>
      </div>

      <SurveyResultsView initialResponses={responses ?? []} />
    </div>
  );
}
