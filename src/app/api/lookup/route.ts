import { NextResponse } from "next/server";
import { lookupSchema, normalizePhone } from "@/lib/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSignedCertificateUrl } from "@/lib/certificate";
import { TABLES } from "@/lib/db-tables";

export interface LookupResultItem {
  applicationId: string;
  round: number;
  topic: string;
  startAt: string;
  endAt: string;
  location: string;
  status: string;
  certNo: string | null;
  certDownloadUrl: string | null;
}

/**
 * 신청내역조회 API (PRD §5.3, §10).
 * applications 테이블은 RLS로 공개 SELECT가 차단되어 있으므로, 이 라우트에서만
 * Service Role로 "성명+연락처가 정확히 일치하는 건"만 서버에서 필터링하여 반환한다.
 */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = lookupSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." },
      { status: 400 }
    );
  }

  const { name, phone } = parsed.data;
  const normalizedPhone = normalizePhone(phone);

  const supabase = createSupabaseAdminClient();

  const { data: applications, error } = await supabase
    .from(TABLES.APPLICATIONS)
    .select(
      "id, name, phone, status, workshop:workshops(round, topic, start_at, end_at, location)"
    )
    .eq("name", name);

  if (error) {
    return NextResponse.json({ error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }

  const matched = (applications ?? []).filter(
    (row) => normalizePhone(row.phone) === normalizedPhone
  );

  if (matched.length === 0) {
    return NextResponse.json({ results: [] as LookupResultItem[] });
  }

  const matchedIds = matched.map((row) => row.id);
  const { data: certificates } = await supabase
    .from(TABLES.CERTIFICATES)
    .select("application_id, cert_no, pdf_path")
    .in("application_id", matchedIds);

  const certByApplicationId = new Map((certificates ?? []).map((c) => [c.application_id, c]));

  const results: LookupResultItem[] = await Promise.all(
    matched.map(async (row) => {
      const workshop = Array.isArray(row.workshop) ? row.workshop[0] : row.workshop;
      const cert = certByApplicationId.get(row.id);

      let certDownloadUrl: string | null = null;
      if (row.status === "이수" && cert?.pdf_path) {
        try {
          certDownloadUrl = await getSignedCertificateUrl(supabase, cert.pdf_path);
        } catch (err) {
          console.error(`[lookup] signed URL 생성 실패 (application_id=${row.id}):`, err);
          certDownloadUrl = null;
        }
      }

      return {
        applicationId: row.id,
        round: workshop?.round ?? 0,
        topic: workshop?.topic ?? "",
        startAt: workshop?.start_at ?? "",
        endAt: workshop?.end_at ?? "",
        location: workshop?.location ?? "",
        status: row.status,
        certNo: cert?.cert_no ?? null,
        certDownloadUrl,
      };
    })
  );

  results.sort((a, b) => a.round - b.round);

  return NextResponse.json({ results });
}
