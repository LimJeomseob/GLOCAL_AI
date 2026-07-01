import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TABLES } from "@/lib/db-tables";
import type { ApplicationWithWorkshop, KakaoAutoSendSettings, KakaoNotification } from "@/lib/types";
import { ApplicantsTable } from "@/components/admin/ApplicantsTable";
import { KakaoSettingsPanel } from "@/components/admin/KakaoSettingsPanel";

export const dynamic = "force-dynamic";

export default async function AdminApplicantsPage() {
  const supabase = createSupabaseServerClient();

  const [{ data: applications }, { data: kakaoSettings }, { data: kakaoNotifications }] =
    await Promise.all([
      supabase
        .from(TABLES.APPLICATIONS)
        .select("*, workshop:workshops(id, round, topic, start_at, end_at, location)")
        .order("created_at", { ascending: false })
        .returns<ApplicationWithWorkshop[]>(),
      supabase.from(TABLES.KAKAO_SEND_SETTINGS).select("*").maybeSingle<KakaoAutoSendSettings>(),
      supabase
        .from(TABLES.KAKAO_NOTIFICATIONS)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<KakaoNotification[]>(),
    ]);

  // PostgREST가 to-one 임베드(workshop:workshops(...))를 스키마 캐시 상태에 따라
  // 배열로 반환하는 경우가 있어, 클라이언트 컴포넌트들이 항상 객체 형태를 받도록 여기서 정규화한다.
  const normalizedApplications: ApplicationWithWorkshop[] = (applications ?? []).map((row) => ({
    ...row,
    workshop: Array.isArray(row.workshop) ? row.workshop[0] : row.workshop,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-bold text-brand sm:text-2xl">신청자 관리</h1>
        <p className="mt-1 text-sm text-slate-500">
          전체 신청자 목록을 확인하고 상태 변경, 이수처리, 수료증 발급을 진행할 수 있습니다.
        </p>
      </div>

      <KakaoSettingsPanel
        initialSettings={kakaoSettings ?? null}
        initialNotifications={kakaoNotifications ?? []}
        applications={normalizedApplications}
      />

      <ApplicantsTable initialApplications={normalizedApplications} />
    </div>
  );
}
