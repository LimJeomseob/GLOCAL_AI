// 공개 수료증 발급 Edge Function (신청 포털 '수료증 발급' 탭).
// certificates/certificate_templates 테이블은 RLS로 공개 접근이 차단되어 있으므로,
// lookup과 동일하게 이 함수에서만 Service Role로 "성명+연락처가 정확히 일치하는
// 본인 신청 건"을 검증한 뒤 발급(RPC)·서식 전달·업로드 URL 서명을 수행한다.
// PDF 생성 자체는 브라우저에서 한다(fontkit이 Deno에서 실패 — certificatePdf.ts 참조).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import {
  identityWithApplicationSchema,
  matchesIdentity,
  IDENTITY_MISMATCH_MESSAGE,
} from "../_shared/identity.ts";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "../_shared/rateLimit.ts";

const issueSchema = identityWithApplicationSchema;

const CERTIFICATES_BUCKET = "certificates";

/** public.certificates 행 (issue_certificate() RPC의 반환 형태) */
interface CertificateRow {
  id: string;
  application_id: string;
  cert_no: string;
  issuer: string;
  issued_at: string;
  reissue_count: number;
  pdf_path: string | null;
}

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // 발급번호 채번을 동반하므로 반복 호출을 빈도 제한으로 막는다.
  const { allowed } = await checkRateLimit(supabase, req, "issue-cert", name);
  if (!allowed) {
    return jsonResponse({ error: RATE_LIMIT_MESSAGE }, 429, { "Retry-After": "600" });
  }

  const { data: application, error: appError } = await supabase
    .from("applications")
    .select(
      "id, name, phone, affiliation, status, workshop:workshops(round, round_label, topic, start_at, end_at)"
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (appError) {
    return jsonResponse({ error: "조회 중 오류가 발생했습니다." }, 500);
  }

  // 존재 여부를 드러내지 않도록 미존재/본인 불일치를 같은 메시지로 처리한다.
  if (!matchesIdentity(application, name, phone)) {
    return jsonResponse({ error: IDENTITY_MISMATCH_MESSAGE }, 404);
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

  // DB 타입을 생성해 쓰지 않으므로 rpc()의 반환 타입이 {} 로 추론된다.
  // issue_certificate()는 public.certificates 행을 그대로 돌려주므로 그 형태로 좁힌다.
  const { data: certData, error: rpcError } = await supabase
    .rpc("issue_certificate", { p_application_id: applicationId, p_channel: "public" })
    .single();
  const cert = certData as CertificateRow | null;

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
      roundLabel: workshop.round_label ?? `${workshop.round}차`,
      topic: workshop.topic,
      startAt: workshop.start_at,
      endAt: workshop.end_at,
      template: templateRow.template,
      upload: { path: signedUpload.path, token: signedUpload.token },
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
