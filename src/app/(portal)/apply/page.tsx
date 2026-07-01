import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ApplicationForm, type WorkshopOption } from "@/components/ApplicationForm";
import { TABLES } from "@/lib/db-tables";
import type { Workshop } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ApplyPage() {
  const supabase = createSupabaseServerClient();

  const [{ data: workshops }, { data: availability }] = await Promise.all([
    supabase
      .from(TABLES.WORKSHOPS)
      .select("*")
      .order("round", { ascending: true })
      .returns<Workshop[]>(),
    supabase.rpc("get_workshop_availability"),
  ]);

  const appliedCountByWorkshopId = new Map<string, number>(
    (availability ?? []).map((row: { workshop_id: string; applied_count: number }) => [
      row.workshop_id,
      row.applied_count,
    ])
  );

  const now = Date.now();

  const options: WorkshopOption[] = (workshops ?? []).map((workshop) => {
    const appliedCount = appliedCountByWorkshopId.get(workshop.id) ?? 0;
    const remaining = workshop.capacity - appliedCount;
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
      remaining,
      isClosed,
    };
  });

  return <ApplicationForm workshopOptions={options} />;
}
