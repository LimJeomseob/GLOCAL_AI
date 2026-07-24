// 신청내역조회 Edge Function (PRD §5.3, §10).
// applications 테이블은 RLS로 공개 SELECT가 차단되어 있으므로, 이 함수에서만
// Service Role로 "성명+연락처가 정확히 일치하는 건"만 서버(Deno)에서 필터링하여 반환한다.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { corsHeaders, handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";

const PHONE_REGEX = /^01[0-9]-?\d{3,4}-?\d{4}$/;

const lookupSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().regex(PHONE_REGEX),
});

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

interface LookupResultItem {
  applicationId: string;
  round: number;
  roundLabel: string;
  topic: string;
  startAt: string;
  endAt: string;
  location: string;
  status: string;
  certNo: string | null;
  certDownloadUrl: string | null;
}

const CERTIFICATES_BUCKET = "certificates";

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const json = await req.json().catch(() => null);
  const parsed = lookupSchema.safeParse(json);
  if (!parsed.success) {
    return jsonResponse({ error: "입력값을 확인해 주세요." }, 400);
  }

  const { name, phone } = parsed.data;
  const normalizedPhone = normalizePhone(phone);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { data: applications, error } = await supabase
    .from("applications")
    .select(
      "id, name, phone, status, workshop:workshops(round, round_label, topic, start_at, end_at, location)"
    )
    .eq("name", name);

  if (error) {
    return jsonResponse({ error: "조회 중 오류가 발생했습니다." }, 500);
  }

  const matched = (applications ?? []).filter(
    (row: { phone: string }) => normalizePhone(row.phone) === normalizedPhone
  );

  if (matched.length === 0) {
    return jsonResponse({ results: [] as LookupResultItem[] });
  }

  const matchedIds = matched.map((row: { id: string }) => row.id);
  const { data: certificates } = await supabase
    .from("certificates")
    .select("application_id, cert_no, pdf_path")
    .in("application_id", matchedIds);

  const certByApplicationId = new Map(
    (certificates ?? []).map((c: { application_id: string }) => [c.application_id, c])
  );

  const results: LookupResultItem[] = await Promise.all(
    matched.map(async (row: any) => {
      const workshop = Array.isArray(row.workshop) ? row.workshop[0] : row.workshop;
      const cert = certByApplicationId.get(row.id) as
        | { cert_no: string; pdf_path: string | null }
        | undefined;

      let certDownloadUrl: string | null = null;
      if (row.status === "이수" && cert?.pdf_path) {
        const { data: signed, error: signError } = await supabase.storage
          .from(CERTIFICATES_BUCKET)
          .createSignedUrl(cert.pdf_path, 600);
        if (signError) {
          console.error(`[lookup] signed URL 생성 실패 (application_id=${row.id}):`, signError);
        } else {
          certDownloadUrl = signed?.signedUrl ?? null;
        }
      }

      return {
        applicationId: row.id,
        round: workshop?.round ?? 0,
        roundLabel: workshop?.round_label ?? (workshop?.round ? `${workshop.round}차` : ""),
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

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
