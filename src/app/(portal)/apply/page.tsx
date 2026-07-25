"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApplicationForm, type WorkshopOption } from "@/components/ApplicationForm";
import { deriveWorkshopStatus, fetchWorkshopsWithAvailability } from "@/lib/workshops";

function ApplyContent() {
  // 소개 탭 "신청 바로가기"(/apply?round=N)로 진입 시 해당 회차를 자동 선택
  const searchParams = useSearchParams();
  const roundParam = Number(searchParams.get("round"));
  const initialRound = Number.isInteger(roundParam) && roundParam > 0 ? roundParam : undefined;

  const [options, setOptions] = useState<WorkshopOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const { workshops, appliedCountByWorkshopId } = await fetchWorkshopsWithAvailability();

        if (!active) return;

        const now = Date.now();

        const nextOptions: WorkshopOption[] = workshops.map((workshop) => {
          const appliedCount = appliedCountByWorkshopId.get(workshop.id) ?? 0;
          const { remaining, isNotYetOpen, isClosed } = deriveWorkshopStatus(
            workshop,
            appliedCount,
            now
          );

          return {
            id: workshop.id,
            round: workshop.round,
            roundLabel: workshop.round_label ?? `${workshop.round}차`,
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
      } catch {
        if (active) setError("회차 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
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
