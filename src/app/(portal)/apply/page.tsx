"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ApplicationForm, type WorkshopOption } from "@/components/ApplicationForm";
import { TABLES } from "@/lib/db-tables";
import type { Workshop } from "@/lib/types";

function ApplyContent() {
  // 소개 탭 "신청 바로가기"(/apply?round=N)로 진입 시 해당 회차를 자동 선택
  const searchParams = useSearchParams();
  const roundParam = Number(searchParams.get("round"));
  const initialRound = Number.isInteger(roundParam) && roundParam > 0 ? roundParam : undefined;

  const [options, setOptions] = useState<WorkshopOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();

    async function load() {
      const [{ data: workshops, error: workshopsError }, { data: availability, error: rpcError }] =
        await Promise.all([
          supabase
            .from(TABLES.WORKSHOPS)
            .select("*")
            .order("round", { ascending: true })
            .returns<Workshop[]>(),
          supabase.rpc("get_workshop_availability"),
        ]);

      if (!active) return;

      if (workshopsError || rpcError) {
        setError("회차 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }

      // get_workshop_availability()의 applied_count는 Postgres bigint이며 PostgREST가
      // JSON 정밀도 손실 방지를 위해 문자열로 직렬화하므로 명시적으로 숫자 변환한다.
      const appliedCountByWorkshopId = new Map<string, number>(
        (availability ?? []).map(
          (row: { workshop_id: string; applied_count: number | string }) => [
            row.workshop_id,
            Number(row.applied_count),
          ]
        )
      );

      const now = Date.now();

      const nextOptions: WorkshopOption[] = (workshops ?? []).map((workshop) => {
        const appliedCount = appliedCountByWorkshopId.get(workshop.id) ?? 0;
        const remaining = workshop.capacity - appliedCount;
        const isNotYetOpen = now < new Date(workshop.apply_open_at).getTime();
        const isDeadlinePassed = now > new Date(workshop.deadline).getTime();
        const isClosed = remaining <= 0 || isDeadlinePassed;

        return {
          id: workshop.id,
          round: workshop.round,
          topic: workshop.topic,
          instructor: workshop.instructor,
          location: workshop.location,
          startAt: workshop.start_at,
          endAt: workshop.end_at,
          deadline: workshop.deadline,
          applyOpenAt: workshop.apply_open_at,
          remaining,
          isNotYetOpen,
          isClosed,
        };
      });

      setOptions(nextOptions);
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!options) {
    return (
      <p role="status" className="text-sm text-slate-500">
        회차 정보를 불러오는 중...
      </p>
    );
  }

  return <ApplicationForm workshopOptions={options} initialRound={initialRound} />;
}

export default function ApplyPage() {
  return (
    <Suspense>
      <ApplyContent />
    </Suspense>
  );
}
