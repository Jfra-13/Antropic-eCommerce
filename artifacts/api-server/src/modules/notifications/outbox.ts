import type { NotificationDelivery } from "@workspace/db";
import { logger } from "../../lib/logger";
import { reportError } from "../../lib/observability";
import { sendEmail } from "../../lib/notify";
import {
  insertDelivery,
  claimDueDeliveries,
  recordDeliveryOutcome,
  type DeliveryOutcome,
} from "./queries";

// The outbox: every message this system sends is a row before it is an email (auditoría §8.3).
//
// THE RULE THAT MUST NOT BE SIMPLIFIED AWAY: nothing in this file may throw into a caller.
// Business flows call it with `void`, and a mail provider having a bad day can never be
// allowed to fail a checkout, a complaint filing or a payment approval. Everything below is
// wrapped; the cost of a bug in here is a missing notification, never a lost order.

// Attempt N waits BACKOFF_MINUTES[N-1] before N+1. Roughly five hours of coverage in total,
// which spans a normal provider outage without keeping a dead message in the queue for days.
const BACKOFF_MINUTES = [1, 5, 15, 60, 240];
const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1;

// How long a claimed row stays claimed. Longer than any single send can take (the transport
// times out at 10s), short enough that a worker killed mid-flight does not strand its rows.
const CLAIM_LEASE_MINUTES = 5;

// Ceiling per run of the retry job. Bounded so one run cannot hold a huge working set, and so
// a backlog drains over several runs instead of one very long one.
const DEFAULT_BATCH = 50;

export type EnqueueInput = {
  kind: string;
  to: string;
  subject: string;
  html: string;
  relatedType?: string;
  relatedId?: string;
};

function nextAttemptDate(attempts: number): Date {
  const minutes = BACKOFF_MINUTES[attempts - 1] ?? BACKOFF_MINUTES[BACKOFF_MINUTES.length - 1]!;
  return new Date(Date.now() + minutes * 60_000);
}

// Decide what one failed attempt means for the row's future. Exported for the unit tests: the
// retry schedule is the kind of thing that is easy to get subtly wrong (an off-by-one here
// means either one retry too few, or a message that never stops being retried) and it needs no
// database to check.
export function outcomeForFailure(
  attempts: number,
  retryable: boolean,
  error: string,
): DeliveryOutcome {
  if (!retryable) return { status: "fallido", error };
  if (attempts >= MAX_ATTEMPTS) return { status: "fallido", error: `${error} (sin reintentos)` };
  return { status: "pendiente", error, nextAttemptAt: nextAttemptDate(attempts) };
}

// Deliver one already-claimed row and record the result. Returns whether it went out, for the
// job's summary line.
async function deliverClaimed(row: NotificationDelivery): Promise<boolean> {
  const result = await sendEmail({ to: row.recipient, subject: row.subject, html: row.bodyHtml });

  if (result.ok) {
    await recordDeliveryOutcome(row.id, { status: "enviado" });
    return true;
  }

  const outcome = outcomeForFailure(row.attempts, result.retryable, result.error);
  await recordDeliveryOutcome(row.id, outcome);

  if (outcome.status === "fallido") {
    // Giving up is the moment worth reporting: everything before it is expected turbulence.
    reportError(new Error(result.error), {
      notificationId: row.id,
      kind: row.kind,
      recipient: row.recipient,
      attempts: row.attempts,
    });
  } else {
    logger.warn(
      { notificationId: row.id, kind: row.kind, attempts: row.attempts, err: result.error },
      "notification delivery failed, will retry",
    );
  }
  return false;
}

// Record a notification and try to send it right away.
//
// The row is written BEFORE the send is attempted, and that ordering is the whole point: a
// process that dies mid-send leaves a pending row the retry job will pick up, whereas
// send-then-record loses the message entirely in exactly the case that matters.
export async function enqueueEmail(input: EnqueueInput): Promise<void> {
  let row: NotificationDelivery;
  try {
    row = await insertDelivery({
      kind: input.kind,
      recipient: input.to,
      subject: input.subject,
      bodyHtml: input.html,
      relatedType: input.relatedType ?? null,
      relatedId: input.relatedId ?? null,
      status: "pendiente",
      // Counted as the first attempt, which happens immediately below. Its lease means that if
      // this process dies before recording an outcome, the job retries it rather than
      // attempting it a second time straight away.
      attempts: 1,
      nextAttemptAt: new Date(Date.now() + CLAIM_LEASE_MINUTES * 60_000),
    });
  } catch (err) {
    // The outbox itself is down. Nothing left but the log — but never the caller's problem.
    reportError(err, { kind: input.kind, recipient: input.to, at: "enqueueEmail.insert" });
    return;
  }

  try {
    await deliverClaimed(row);
  } catch (err) {
    reportError(err, { notificationId: row.id, kind: input.kind, at: "enqueueEmail.deliver" });
  }
}

export type DeliveryRunReport = { claimed: number; sent: number; failed: number };

// Drain the due queue. Used by the retry job; safe to run concurrently with itself and with
// live traffic (see claimDueDeliveries for why).
export async function deliverDueNotifications(batch = DEFAULT_BATCH): Promise<DeliveryRunReport> {
  const claimed = await claimDueDeliveries(batch, CLAIM_LEASE_MINUTES);
  let sent = 0;

  for (const row of claimed) {
    try {
      if (await deliverClaimed(row)) sent += 1;
    } catch (err) {
      // One poisoned row must not abort the batch: the rest of the queue is still deliverable,
      // and the lease will bring this one back.
      reportError(err, { notificationId: row.id, kind: row.kind, at: "deliverDueNotifications" });
    }
  }

  return { claimed: claimed.length, sent, failed: claimed.length - sent };
}

export const outboxTuning = { BACKOFF_MINUTES, MAX_ATTEMPTS, CLAIM_LEASE_MINUTES } as const;
