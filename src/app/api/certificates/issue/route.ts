import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TABLES } from "@/lib/db-tables";
import {
  buildCertificatePdfPath,
  generateCertificatePdf,
  uploadCertificatePdf,
} from "@/lib/certificate";
import type { Certificate } from "@/lib/types";

const bodySchema = z.object({
  applicationIds: z.array(z.string().uuid()).min(1).max(220),
});

interface IssueResult {
  applicationId: string;
  success: boolean;
  certNo?: string;
  error?: string;
}

/**
 * 관리자 전용 수료증 발급/재발급/일괄발급 API (PRD §6.2, §6.4).
 * 인증은 미들웨어(§6.1) 1차 통제 + 아래 세션 확인 + RLS/issue_certificate() 함수 내 is_admin() 이중 통제.
 */
export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const results: IssueResult[] = [];

  for (const applicationId of parsed.data.applicationIds) {
    try {
      const { data: appRow, error: appError } = await supabase
        .from(TABLES.APPLICATIONS)
        .select("id, name, affiliation, status, workshop:workshops(round, topic, start_at, end_at)")
        .eq("id", applicationId)
        .single();

      if (appError || !appRow) throw new Error("신청 건을 찾을 수 없습니다.");
      const workshop = Array.isArray(appRow.workshop) ? appRow.workshop[0] : appRow.workshop;
      if (!workshop) throw new Error("워크숍 정보를 찾을 수 없습니다.");

      const { data: cert, error: rpcError } = await supabase
        .rpc("issue_certificate", { p_application_id: applicationId })
        .single<Certificate>();

      if (rpcError || !cert) throw new Error(rpcError?.message ?? "수료증 발급에 실패했습니다.");

      const pdfBytes = await generateCertificatePdf({
        certNo: cert.cert_no,
        name: appRow.name,
        affiliation: appRow.affiliation,
        round: workshop.round,
        topic: workshop.topic,
        startAt: workshop.start_at,
        endAt: workshop.end_at,
        issuedAt: cert.issued_at,
      });

      const pdfPath = buildCertificatePdfPath(workshop.round, cert.cert_no);
      await uploadCertificatePdf(supabase, pdfPath, pdfBytes);

      const { error: updateError } = await supabase
        .from(TABLES.CERTIFICATES)
        .update({ pdf_path: pdfPath })
        .eq("id", cert.id);

      if (updateError) throw new Error(updateError.message);

      results.push({ applicationId, success: true, certNo: cert.cert_no });
    } catch (err) {
      results.push({
        applicationId,
        success: false,
        error: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.",
      });
    }
  }

  return NextResponse.json({ results });
}
