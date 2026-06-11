// Transactional email via Resend, gated behind RESEND_API_KEY. When the key is
// absent every send is a no-op ({ sent: false }) so the app works fully without
// email configured — callers fall back to surfacing a copyable link. Uses the
// REST API directly (no SDK dependency).

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** True when an email provider is configured. */
export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Absolute base URL for links embedded in emails (server-side has no origin).
 * Prefers an explicit APP_URL; otherwise uses Vercel's production domain so prod
 * links never silently fall back to localhost. Localhost is the last resort
 * (local dev only).
 */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}

type SendArgs = { to: string; subject: string; html: string };

/**
 * Best-effort send. Never throws: returns { sent } so callers can keep working
 * (and keep showing the copy-link) whether or not email is configured/succeeds.
 */
export async function sendEmail({ to, subject, html }: SendArgs): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false };

  const from = process.env.EMAIL_FROM || "Artisan Project Hub <onboarding@resend.dev>";
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      return { sent: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

/** Escape user-controlled text before interpolating into email HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Simple HTML for the portal invite email. */
export function inviteEmailHtml({ link, orgName }: { link: string; orgName: string }): string {
  // orgName is tenant-controlled → escape it. `link` is system-generated
  // (APP_URL + a base64url token), so it's safe in the href/text as-is.
  const org = escapeHtml(orgName);
  return `
  <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#1d2939">
    <h2 style="font-size:18px">You're invited to ${org}'s project portal</h2>
    <p style="color:#475467;font-size:14px;line-height:1.5">
      ${org} uses Artisan Project Hub to share project updates and files with you.
      Set a password to access your projects.
    </p>
    <p style="margin:24px 0">
      <a href="${link}" style="background:#2f6f5e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">
        Accept invitation
      </a>
    </p>
    <p style="color:#98a2b3;font-size:12px;word-break:break-all">
      Or paste this link into your browser:<br>${link}
    </p>
  </div>`;
}
