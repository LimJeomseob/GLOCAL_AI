// 관리자 알림 메일 발송 래퍼. 기본 공급자 = Resend(https://resend.com).
// 정적 사이트(서버 없음)라 이메일은 Edge Function에서만 발송하며, 비밀키는 서버 secrets로만 보관한다.
// 다른 공급자로 교체하려면 이 파일만 수정하면 된다.

export interface SendEmailInput {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("MAIL_FROM"));
}

export async function sendAdminEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM");

  if (!apiKey || !from) {
    return {
      ok: false,
      error: "관리자 알림 메일이 아직 구성되지 않았습니다(RESEND_API_KEY / MAIL_FROM 환경변수 미설정).",
    };
  }

  if (input.to.length === 0) {
    return { ok: false, error: "수신 관리자 이메일이 없습니다(admin_users 확인 필요)." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `이메일 발송 실패(Resend ${res.status}): ${body}` };
    }

    const data = await res.json().catch(() => ({}));
    return { ok: true, id: data?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "이메일 발송 중 네트워크 오류" };
  }
}
