import { logger } from "./logger";
import { env } from "./env";

// Transport for transactional email: Resend's REST API, no SDK (same fetch pattern as
// storage.ts). This module KNOWS NOTHING about business flows or about retrying — it posts one
// message and reports what happened. Deciding what a failure means is the outbox's job
// (modules/notifications/outbox.ts).
//
// It used to swallow every failure so that email could never break a checkout. That guarantee
// is unchanged, but it now lives one level up: the caller records the outcome instead of
// discarding it. A failure that only ever reached `logger.warn` is a failure nobody finds.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type Email = { to: string; subject: string; html: string };

// `retryable` separates "try again later" from "trying again changes nothing":
// a 5xx or a timeout is the provider having a bad minute; a rejected address or a missing API
// key will fail identically on every attempt, and burning six retries on it only delays the
// moment somebody notices.
export type SendResult = { ok: true } | { ok: false; retryable: boolean; error: string };

export async function sendEmail(email: Email): Promise<SendResult> {
  const key = env.RESEND_API_KEY;
  const from = env.RESEND_FROM;

  if (!key || !from) {
    // Not an exception: running without email configured is a supported state (local
    // development, and production before the domain is verified). It is recorded as a failed
    // delivery rather than silently dropped, so "we never sent any of these" is visible in the
    // backoffice instead of being discovered by a customer.
    return { ok: false, retryable: false, error: "RESEND_API_KEY / RESEND_FROM sin configurar" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: email.to, subject: email.subject, html: email.html }),
      // Never let a slow provider hold a request open indefinitely.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      return {
        ok: false,
        // 429 is rate limiting and 5xx is the provider's problem: both are worth another go.
        // Every other 4xx is about this message and will not fix itself.
        retryable: res.status === 429 || res.status >= 500,
        error: `HTTP ${res.status}: ${body}`,
      };
    }
    logger.info({ to: email.to, subject: email.subject }, "email sent");
    return { ok: true };
  } catch (err) {
    // Network failure or the 10s timeout above. Always worth retrying.
    return { ok: false, retryable: true, error: err instanceof Error ? err.message : String(err) };
  }
}

// The address that receives backoffice alerts (new proof, new return, new complaint). Optional.
export function adminNotificationEmail(): string | undefined {
  return env.ADMIN_NOTIFICATION_EMAIL;
}
