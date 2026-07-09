// 공개 수료증 발급 Edge Function (신청 포털 '수료증 발급' 탭).
// certificates/certificate_templates 테이블은 RLS로 공개 접근이 차단되어 있으므로,
// lookup과 동일하게 이 함수에서만 Service Role로 "성명+연락처가 정확히 일치하는
// 본인 신청 건"을 검증한 뒤 발급(RPC)·서식 전달·업로드 URL 서명을 수행한다.
// PDF 생성 자체는 브라우저에서 한다(fontkit이 Deno에서 실패 — certificatePdf.ts 참조).
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { corsHeaders, handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";

const PHONE_REGEX = /^01[0-9]-?\d{3,4}-?\d{4}$/;

const issueSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().regex(PHONE_REGEX),
  applicationId: z.string().uuid(),
});

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

const CERTIFICATES_BUCKET = "certificates";

/** 스토리지 키는 ASCII만 허용되므로 발급번호에서 숫자·하이픈만 남긴다 (제2026-001호 → 2026-001) */
function buildPdfPath(round: number, certNo: string): string {
  return `${round}/${certNo.replace(/[^0-9A-Za-z-]/g, "")}.pdf`;
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const json = await req.json().catch(() => null);
  const parsed = issueSchema.safeParse(json);
  if (!parsed.success) {
    return jsonResponse({ error: "입력값을 확인해 주세요." }, 400);
  }

  const { name, phone, applicationId } = parsed.data;
  const normalizedPhone = normalizePhone(phone);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { data: application, error: appError } = await supabase
    .from("applications")
    .select(
      "id, name, phone, affiliation, status, workshop:workshops(round, topic, start_at, end_at)"
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (appError) {
    return jsonResponse({ error: "조회 중 오류가 발생했습니다." }, 500);
  }

  // 존재 여부를 드러내지 않도록 미존재/본인 불일치를 같은 메시지로 처리한다.
  const identityMismatch =
    !application ||
    application.name !== name ||
    normalizePhone(application.phone) !== normalizedPhone;
  if (identityMismatch) {
    return jsonResponse(
      { error: "일치하는 신청 내역이 없습니다. 성명과 연락처를 확인해 주세요." },
      404
    );
  }

  if (application.status !== "이수") {
    return jsonResponse({ error: "이수 상태인 신청 건만 수료증을 발급할 수 있습니다." }, 400);
  }

  const workshop = Array.isArray(application.workshop)
    ? application.workshop[0]
    : application.workshop;
  if (!workshop) {
    return jsonResponse({ error: "회차 정보를 확인할 수 없습니다." }, 500);
  }

  const { data: cert, error: rpcError } = await supabase
    .rpc("issue_certificate", { p_application_id: applicationId, p_channel: "public" })
    .single();

  if (rpcError || !cert) {
    console.error(`[issue-certificate] RPC 실패 (application_id=${applicationId}):`, rpcError);
    return jsonResponse({ error: rpcError?.message ?? "수료증 발급에 실패했습니다." }, 500);
  }

  const { data: templateRow, error: templateError } = await supabase
    .from("certificate_templates")
    .select("template")
    .eq("name", "default")
    .maybeSingle();

  if (templateError || !templateRow) {
    console.error("[issue-certificate] 서식 조회 실패:", templateError);
    return jsonResponse(
      { error: "수료증 서식을 불러올 수 없습니다. 관리자에게 문의해 주세요." },
    500
    );
  }

  // 재발급이면 기존 pdf_path(레거시 형식 포함)를 그대로 사용해 조회 링크와 어긋나지 않게 한다.
  const pdfPath: string = cert.pdf_path ?? buildPdfPath(workshop.round, cert.cert_no);

  const { data: signedUpload, error: signError } = await supabase.storage
    .from(CERTIFICATES_BUCKET)
    .createSignedUploadUrl(pdfPath, { upsert: true });

  if (signError || !signedUpload) {
    console.error(`[issue-certificate] 업로드 URL 서명 실패 (path=${pdfPath}):`, signError);
    return jsonResponse({ error: "수료증 저장 준비에 실패했습니다. 다시 시도해 주세요." }, 500);
  }

  if (!cert.pdf_path) {
    const { error: pathError } = await supabase
      .from("certificates")
      .update({ pdf_path: pdfPath })
      .eq("id", cert.id);
    if (pathError) {
      console.error(`[issue-certificate] pdf_path 저장 실패 (cert_id=${cert.id}):`, pathError);
    }
  }

  return new Response(
    JSON.stringify({
      certNo: cert.cert_no,
      issuedAt: cert.issued_at,
      reissueCount: cert.reissue_count,
      name: application.name,
      affiliation: application.affiliation,
      round: workshop.round,
      topic: workshop.topic,
      startAt: workshop.start_at,
      endAt: workshop.end_at,
      template: templateRow.template,
      upload: { path: signedUpload.path, token: signedUpload.token },
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
