"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLES, CERTIFICATES_BUCKET } from "@/lib/db-tables";
import {
  buildCertificatePdfPath,
  buildCertificateValues,
  renderCertificateFromTemplate,
} from "@/lib/certificatePdf";
import type { ApplicationWithWorkshop, Certificate, CertificateTemplate } from "@/lib/types";

export interface IssueCertificateResult {
  applicationId: string;
  success: boolean;
  certNo?: string;
  downloadUrl?: string;
  error?: string;
}

/** DB에 저장된 수료증 서식(JSON)을 조회한다 — RLS is_admin() 통과가 전제. */
async function fetchCertificateTemplate(supabase: SupabaseClient): Promise<CertificateTemplate> {
  const { data, error } = await supabase
    .from(TABLES.CERTIFICATE_TEMPLATES)
    .select("template")
    .eq("name", "default")
    .maybeSingle<{ template: CertificateTemplate }>();

  if (error || !data) {
    throw new Error("수료증 서식을 불러올 수 없습니다. 서식(certificate_templates)을 확인해 주세요.");
  }
  return data.template;
}

/**
 * 수료증 발급/재발급(PRD §6.2, §6.4). Edge Function 없이 관리자의 인증된 브라우저
 * 세션으로 직접 처리한다 — RPC(issue_certificate)와 Storage 쓰기 모두 RLS의
 * is_admin() 체크로 이중 통제되므로 관리자가 아니면 애초에 실패한다.
 * 공개 수료증 발급 탭과 동일한 서식(certificate_templates)·번호체계를 사용한다.
 */
export async function issueCertificateForApplication(
  supabase: SupabaseClient,
  application: ApplicationWithWorkshop,
  template?: CertificateTemplate
): Promise<IssueCertificateResult> {
  const applicationId = application.id;

  try {
    const resolvedTemplate = template ?? (await fetchCertificateTemplate(supabase));

    const { data: cert, error: rpcError } = await supabase
      .rpc("issue_certificate", { p_application_id: applicationId })
      .single<Certificate>();

    if (rpcError || !cert) {
      throw new Error(rpcError?.message ?? "수료증 발급에 실패했습니다.");
    }

    const values = buildCertificateValues({
      certNo: cert.cert_no,
      name: application.name,
      affiliation: application.affiliation,
      round: application.workshop.round,
      topic: application.workshop.topic,
      startAt: application.workshop.start_at,
      endAt: application.workshop.end_at,
      issuedAt: cert.issued_at,
    });
    const pdfBytes = await renderCertificateFromTemplate(resolvedTemplate, values);

    // 재발급이면 기존 pdf_path(레거시 경로 포함)를 그대로 덮어써 조회 링크와 어긋나지 않게 한다.
    const pdfPath =
      cert.pdf_path ?? buildCertificatePdfPath(application.workshop.round, cert.cert_no);

    const { error: uploadError } = await supabase.storage
      .from(CERTIFICATES_BUCKET)
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (uploadError) throw new Error(uploadError.message);

    if (!cert.pdf_path) {
      const { error: updateError } = await supabase
        .from(TABLES.CERTIFICATES)
        .update({ pdf_path: pdfPath })
        .eq("id", cert.id);

      if (updateError) throw new Error(updateError.message);
    }

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

  // 서식은 배치당 1회만 조회한다. 조회 실패 시 전 건을 동일 오류로 반환.
  let template: CertificateTemplate;
  try {
    template = await fetchCertificateTemplate(supabase);
  } catch (err) {
    const message = err instanceof Error ? err.message : "수료증 서식을 불러올 수 없습니다.";
    return applications.map((a) => ({ applicationId: a.id, success: false, error: message }));
  }

  // 폰트 fetch/Storage 부하를 고려해 순차 처리(일괄발급은 보통 소수~수십 건 규모).
  for (const application of applications) {
    results.push(await issueCertificateForApplication(supabase, application, template));
  }
  return results;
}
