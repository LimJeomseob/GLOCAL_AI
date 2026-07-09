"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-tables";
import type { ApplicationWithWorkshop, KakaoAutoSendSettings, KakaoNotification } from "@/lib/types";
import { ApplicantsTable } from "@/components/admin/ApplicantsTable";
import { ApplicantsDashboard } from "@/components/admin/ApplicantsDashboard";
import { KakaoSettingsPanel } from "@/components/admin/KakaoSettingsPanel";

interface LoadedState {
  applications: ApplicationWithWorkshop[];
  kakaoSettings: KakaoAutoSendSettings | null;
  kakaoNotifications: KakaoNotification[];
}

export default function AdminApplicantsPage() {
  const [state, setState] = useState<LoadedState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();

    async function load() {
      const [applicationsRes, kakaoSettingsRes, kakaoNotificationsRes] = await Promise.all([
        supabase
          .from(TABLES.APPLICATIONS)
          .select(
            "*, workshop:workshops(id, round, topic, start_at, end_at, location, notes, zoom_link)"
          )
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

      if (!active) return;

      if (applicationsRes.error || kakaoSettingsRes.error || kakaoNotificationsRes.error) {
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

      setState({
        applications: normalizedApplications,
        kakaoSettings: kakaoSettingsRes.data ?? null,
        kakaoNotifications: kakaoNotificationsRes.data ?? [],
      });
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

      {!error && !state && (
        <p role="status" className="text-sm text-slate-500">
          신청자 목록을 불러오는 중...
        </p>
      )}

      {state && (
        <>
          <KakaoSettingsPanel
            initialSettings={state.kakaoSettings}
            initialNotifications={state.kakaoNotifications}
            applications={state.applications}
          />

          <ApplicantsDashboard applications={state.applications} />

          <ApplicantsTable initialApplications={state.applications} />
        </>
      )}
    </div>
  );
}
