import { logger } from "./logger";

// Best-effort transactional email via the Resend REST API (no SDK dep — same fetch pattern as
// storage.ts). Email is NEVER allowed to break a business flow: every failure is logged and
// swallowed. When RESEND_API_KEY / RESEND_FROM are unset (dev, or before infra is provisioned)
// this degrades to a logged no-op so the app runs without email configured.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type Email = { to: string; subject: string; html: string };

export async function sendEmail(email: Email): Promise<void> {
  const key = process.env["RESEND_API_KEY"];
  const from = process.env["RESEND_FROM"];

  if (!key || !from) {
    logger.info({ to: email.to, subject: email.subject }, "email skipped (RESEND not configured)");
    return;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: email.to, subject: email.subject, html: email.html }),
      // Email is best-effort; never let a slow provider hold a request open indefinitely.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn(
        { to: email.to, subject: email.subject, status: res.status, body: await res.text() },
        "email send failed",
      );
      return;
    }
    logger.info({ to: email.to, subject: email.subject }, "email sent");
  } catch (err) {
    logger.warn({ err, to: email.to, subject: email.subject }, "email send threw");
  }
}

// The address that receives backoffice alerts (new proof, new return). Optional.
export function adminNotificationEmail(): string | undefined {
  return process.env["ADMIN_NOTIFICATION_EMAIL"] || undefined;
}
