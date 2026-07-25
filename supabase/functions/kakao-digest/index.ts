// 카카오 알림톡 대상자 다이제스트 메일 Edge Function.
// - 직전 다이제스트 이후 새로 접수된 신청자를 모아, 대상자별
//   [ID, 성명, 연락처(010-####-####)] + 그 사람 기준으로 치환된 알림톡 문구를
//   관리자(admin_users의 구글 이메일) 전체에게 1통의 메일로 발송한다.
// - GitHub Actions cron(하루 2회: 09:00/16:00 KST)이 x-kakao-secret 헤더로 호출하거나,
//   관리자가 관리자 페이지에서 "지금 보내기"(관리자 JWT)로 호출한다.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { sendAdminEmail, isEmailConfigured } from "../_shared/email.ts";
import { formatPhone } from "../_shared/phone.ts";

const PROGRAM_NAME = "일과 삶을 바꾸는 생성형 AI 실무과정";

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});
const TIME_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const STAMP_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDateRange(startIso: string, endIso: string): string {
  if (!startIso || !endIso) return "";
  const d = new Date(startIso);
  return `${DATE_FMT.format(d)} ${TIME_FMT.format(d)}~${TIME_FMT.format(new Date(endIso))}`;
}

interface WorkshopRow {
  round: number;
  round_label: string;
  topic: string;
  start_at: string;
  end_at: string;
  location: string;
  notes: string;
  zoom_link: string;
}

interface ApplicationRow {
  id: string;
  name: string;
  id_number: string;
  phone: string;
  status: string;
  created_at: string;
  workshop: WorkshopRow | WorkshopRow[] | null;
}

function renderTemplate(body: string, app: ApplicationRow, w: WorkshopRow | null): string {
  return body
    .replace(/\{성명\}/g, app.name ?? "")
    .replace(/\{프로그램명\}/g, PROGRAM_NAME)
    .replace(/\{회차\}/g, w ? w.round_label || `${w.round}차` : "")
    .replace(/\{상태\}/g, app.status ?? "")
    .replace(/\{일시\}/g, w ? formatDateRange(w.start_at, w.end_at) : "")
    .replace(/\{장소\}/g, w?.location ?? "")
    .replace(/\{유의사항\}/g, w?.notes ?? "")
    .replace(/\{내용요약\}/g, w?.topic ?? "")
    .replace(/\{Zoom링크\}/g, w?.zoom_link ?? "");
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ---- 인증: cron 시크릿 또는 관리자 JWT ----
  const triggerSecret = Deno.env.get("KAKAO_TRIGGER_SECRET");
  const providedSecret = req.headers.get("x-kakao-secret");
  const authHeader = req.headers.get("Authorization");
  let authorized = false;

  if (triggerSecret && providedSecret && providedSecret === triggerSecret) {
    authorized = true; // cron 호출
  } else if (authHeader) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (user?.email) {
      const { data: adminRow } = await userClient
        .from("admin_users")
        .select("id")
        .eq("email", user.email)
        .maybeSingle();
      if (adminRow) authorized = true; // 관리자 수동 실행
    }
  }

  if (!authorized) {
    return jsonResponse({ error: "권한이 없습니다." }, 401);
  }

  if (!isEmailConfigured()) {
    return jsonResponse(
      { error: "관리자 알림 메일이 아직 구성되지 않았습니다(RESEND_API_KEY / MAIL_FROM 미설정)." },
      400
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ---- 설정/상태/템플릿/관리자 이메일 로드 ----
  const [{ data: settings }, { data: stateRow }, { data: admins }] = await Promise.all([
    supabase.from("kakao_send_settings").select("*").maybeSingle(),
    supabase.from("kakao_digest_state").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("admin_users").select("email"),
  ]);

  if (settings && settings.email_enabled === false) {
    return jsonResponse({ error: "관리자 알림 메일이 비활성화되어 있습니다(설정에서 켜 주세요)." }, 400);
  }

  const activeType: string = settings?.active_template_type ?? "1";
  const { data: template } = await supabase
    .from("kakao_templates")
    .select("*")
    .eq("template_type", activeType)
    .maybeSingle();

  if (!template) {
    return jsonResponse({ error: `활성 템플릿(${activeType})을 찾을 수 없습니다.` }, 400);
  }

  const adminEmails = (admins ?? []).map((a: { email: string }) => a.email).filter(Boolean);
  const lastRunAt = stateRow?.last_run_at ?? new Date(0).toISOString();

  // ---- 신규 신청자(직전 다이제스트 이후) 조회 ----
  const { data: applications, error: appErr } = await supabase
    .from("applications")
    .select(
      "id, name, id_number, phone, status, created_at, workshop:workshops(round, round_label, topic, start_at, end_at, location, notes, zoom_link)"
    )
    .gt("created_at", lastRunAt)
    .order("created_at", { ascending: true });

  if (appErr) {
    return jsonResponse({ error: `대상자 조회 실패: ${appErr.message}` }, 500);
  }

  const targets = (applications ?? []) as ApplicationRow[];
  const runStampedAt = new Date().toISOString();

  // 대상자 0명 처리
  if (targets.length === 0) {
    if (settings?.notify_when_empty) {
      await sendAdminEmail({
        to: adminEmails,
        subject: `[특강] 알림톡 대상자 없음 — ${STAMP_FMT.format(new Date())}`,
        text: "직전 발송 이후 새로 접수된 신청자가 없습니다.",
      });
    }
    await supabase.from("kakao_digest_state").update({ last_run_at: runStampedAt }).eq("id", stateRow?.id);
    return jsonResponse({ targetCount: 0, emailSent: false, message: "대상자가 없어 메일을 보내지 않았습니다." });
  }

  // ---- 대상자별 블록(연락처 + 렌더된 알림톡 내용) 구성 ----
  const blocks = targets.map((app, i) => {
    const w = Array.isArray(app.workshop) ? app.workshop[0] : app.workshop;
    const contact = `${i + 1}) [${app.id_number}, ${app.name}, ${formatPhone(app.phone)}]`;
    const rendered = renderTemplate(template.body, app, w ?? null);
    return `${contact}\n   ── 알림톡 내용 ──\n${rendered
      .split("\n")
      .map((line) => `   ${line}`)
      .join("\n")}`;
  });

  const stamp = STAMP_FMT.format(new Date());
  const subject = `${template.email_subject || "[특강] 알림톡 대상자"} ${targets.length}명 — ${stamp}`;
  const text =
    `${PROGRAM_NAME} — 알림톡 발송 대상자 안내\n` +
    `기준 시각: ${stamp} (직전 발송 이후 신규 신청자 ${targets.length}명)\n` +
    `사용 템플릿: ${template.name}\n\n` +
    `아래 각 대상자에게 표시된 알림톡 문구를 발송해 주세요.\n\n` +
    `${blocks.join("\n\n")}\n`;

  const emailResult = await sendAdminEmail({ to: adminEmails, subject, text });

  // ---- 대상자별 이력 기록 + 워터마크 갱신 ----
  const nowIso = new Date().toISOString();
  const historyRows = targets.map((app) => ({
    application_id: app.id,
    recipient: app.phone,
    template_type: activeType,
    channel: "email",
    status: emailResult.ok ? "성공" : "실패",
    sent_at: emailResult.ok ? nowIso : null,
    error_message: emailResult.ok ? null : emailResult.error ?? null,
  }));
  await supabase.from("kakao_notifications").insert(historyRows);

  if (emailResult.ok) {
    await supabase.from("kakao_digest_state").update({ last_run_at: runStampedAt }).eq("id", stateRow?.id);
  }

  if (!emailResult.ok) {
    return new Response(JSON.stringify({ targetCount: targets.length, emailSent: false, error: emailResult.error }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ targetCount: targets.length, emailSent: true, recipients: adminEmails.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
