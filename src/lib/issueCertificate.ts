"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLES, CERTIFICATES_BUCKET } from "@/lib/db-tables";
import { buildCertificatePdfPath, generateCertificatePdf } from "@/lib/certificatePdf";
import type { ApplicationWithWorkshop, Certificate } from "@/lib/types";

export interface IssueCertificateResult {
  applicationId: string;
  success: boolean;
  certNo?: string;
  downloadUrl?: string;
  error?: string;
}

/**
 * 수료증 발급/재발급(PRD §6.2, §6.4). Edge Function 없이 관리자의 인증된 브라우저
 * 세션으로 직접 처리한다 — RPC(issue_certificate)와 Storage 쓰기 모두 RLS의
 * is_admin() 체크로 이중 통제되므로 관리자가 아니면 애초에 실패한다.
 */
export async function issueCertificateForApplication(
  supabase: SupabaseClient,
  application: ApplicationWithWorkshop
): Promise<IssueCertificateResult> {
  const applicationId = application.id;

  try {
    const { data: cert, error: rpcError } = await supabase
      .rpc("issue_certificate", { p_application_id: applicationId })
      .single<Certificate>();

    if (rpcError || !cert) {
      throw new Error(rpcError?.message ?? "수료증 발급에 실패했습니다.");
    }

    const pdfBytes = await generateCertificatePdf({
      certNo: cert.cert_no,
      name: application.name,
      affiliation: application.affiliation,
      round: application.workshop.round,
      topic: application.workshop.topic,
      startAt: application.workshop.start_at,
      endAt: application.workshop.end_at,
      issuedAt: cert.issued_at,
    });

    const pdfPath = buildCertificatePdfPath(application.workshop.round, cert.cert_no);

    const { error: uploadError } = await supabase.storage
      .from(CERTIFICATES_BUCKET)
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (uploadError) throw new Error(uploadError.message);

    const { error: updateError } = await supabase
      .from(TABLES.CERTIFICATES)
      .update({ pdf_path: pdfPath })
      .eq("id", cert.id);

    if (updateError) throw new Error(updateError.message);

    const { data: signed } = await supabase.storage
      .from(CERTIFICATES_BUCKET)
      .createSignedUrl(pdfPath, 600);

    return {
      applicationId,
      success: true,
      certNo: cert.cert_no,
      downloadUrl: signed?.signedUrl,
    };
  } catch (err) {
    return {
      applicationId,
      success: false,
      error: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.",
    };
  }
}

export async function issueCertificatesForApplications(
  supabase: SupabaseClient,
  applications: ApplicationWithWorkshop[]
): Promise<IssueCertificateResult[]> {
  const results: IssueCertificateResult[] = [];
  // 폰트 fetch/Storage 부하를 고려해 순차 처리(일괄발급은 보통 소수~수십 건 규모).
  for (const application of applications) {
    results.push(await issueCertificateForApplication(supabase, application));
  }
  return results;
}
