import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db, notificationDeliveries } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { enqueueEmail, deliverDueNotifications } from "./outbox";
import { listDeliveryRecords, requeueDeliveryRecord } from "./service";
import { resetDatabase } from "../../test/db";

// Fase 7 (auditoría §5, §8.3). Against real Postgres, because two of the three things under
// test are database behaviour: the claim uses FOR UPDATE SKIP LOCKED, and the "is it due yet"
// filter is a partial index predicate. Neither exists in a mock.
//
// The transport is stubbed at `fetch`, which is the ONLY thing faked here: the outbox rows,
// the claiming query, the backoff arithmetic and the state machine are all real.

type FetchResult = { ok: boolean; status: number; body?: string };

function stubTransport(...responses: FetchResult[]) {
  const calls: { to: string; subject: string }[] = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const payload = JSON.parse(init.body) as { to: string; subject: string };
      calls.push({ to: payload.to, subject: payload.subject });
      const r = responses[Math.min(i++, responses.length - 1)]!;
      return {
        ok: r.ok,
        status: r.status,
        text: async () => r.body ?? "",
      } as unknown as Response;
    }),
  );
  return calls;
}

async function rowFor(recipient: string) {
  const rows = await db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.recipient, recipient));
  return rows[0]!;
}

// Bring a queued row's next attempt into the past, the way waiting out the backoff would.
// Asserting the retry with real waiting would make the suite take minutes per case.
async function makeDue(id: string): Promise<void> {
  await db
    .update(notificationDeliveries)
    .set({ nextAttemptAt: new Date(Date.now() - 60_000) })
    .where(eq(notificationDeliveries.id, id));
}

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("outbox delivery", () => {
  it("records the message before sending it and marks it sent", async () => {
    stubTransport({ ok: true, status: 200 });

    await enqueueEmail({
      kind: "payment_approved",
      to: "cliente@example.test",
      subject: "Pago confirmado",
      html: "<p>hola</p>",
      relatedType: "order",
      relatedId: crypto.randomUUID(),
    });

    const row = await rowFor("cliente@example.test");
    expect(row.status).toBe("enviado");
    expect(row.attempts).toBe(1);
    expect(row.sentAt).not.toBeNull();
    // Terminal rows leave the retry queue entirely, or the job would keep picking them up.
    expect(row.nextAttemptAt).toBeNull();
  });

  it("keeps a message queued when the provider fails, and never throws at the caller", async () => {
    stubTransport({ ok: false, status: 503, body: "upstream down" });

    // The guarantee that predates the outbox and must survive it: a mail provider having a bad
    // day cannot fail a checkout, a complaint filing or a payment approval.
    await expect(
      enqueueEmail({ kind: "payment_approved", to: "a@example.test", subject: "s", html: "<p>x</p>" }),
    ).resolves.toBeUndefined();

    const row = await rowFor("a@example.test");
    expect(row.status).toBe("pendiente");
    expect(row.lastError).toContain("503");
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("gives up immediately on a failure that retrying cannot fix", async () => {
    stubTransport({ ok: false, status: 422, body: "invalid recipient" });

    await enqueueEmail({ kind: "payment_approved", to: "nope", subject: "s", html: "<p>x</p>" });

    const row = await rowFor("nope");
    expect(row.status).toBe("fallido");
    expect(row.nextAttemptAt).toBeNull();
  });

  it("treats a rejected API key as terminal, with the reason on the row", async () => {
    // A 401 is the shape a wrong or revoked Resend key takes. Retrying it five times changes
    // nothing; what fixes it is somebody seeing "HTTP 401" in the panel. The unconfigured
    // case (no key at all) is covered in lib/notify.test.ts, where the env module can be
    // replaced — here it is parsed once at import and the process cannot be reconfigured.
    stubTransport({ ok: false, status: 401, body: "no api key" });
    await enqueueEmail({ kind: "proof_received", to: "b@example.test", subject: "s", html: "<p>x</p>" });

    const row = await rowFor("b@example.test");
    expect(row.status).toBe("fallido");
    expect(row.lastError).toContain("401");
  });
});

describe("retry job", () => {
  it("leaves a message alone until its backoff has elapsed", async () => {
    stubTransport({ ok: false, status: 503 });
    await enqueueEmail({ kind: "payment_approved", to: "c@example.test", subject: "s", html: "<p>x</p>" });

    const report = await deliverDueNotifications();
    expect(report.claimed).toBe(0);
  });

  it("delivers it once it is due, and the message goes out exactly once", async () => {
    const calls = stubTransport({ ok: false, status: 503 }, { ok: true, status: 200 });
    await enqueueEmail({ kind: "payment_approved", to: "d@example.test", subject: "s", html: "<p>x</p>" });

    const queued = await rowFor("d@example.test");
    await makeDue(queued.id);

    const report = await deliverDueNotifications();
    expect(report).toMatchObject({ claimed: 1, sent: 1, failed: 0 });

    const row = await rowFor("d@example.test");
    expect(row.status).toBe("enviado");
    expect(row.attempts).toBe(2);
    expect(calls).toHaveLength(2); // the failed first attempt, then the successful retry
  });

  it("does not send the same message twice when two workers run at once", async () => {
    // This is what FOR UPDATE SKIP LOCKED buys. Without it, two schedulers overlapping — or
    // one run taking longer than its cron interval — would deliver the same email twice.
    const calls = stubTransport({ ok: false, status: 503 }, { ok: true, status: 200 });
    await enqueueEmail({ kind: "payment_approved", to: "e@example.test", subject: "s", html: "<p>x</p>" });
    const queued = await rowFor("e@example.test");
    await makeDue(queued.id);

    const [a, b] = await Promise.all([deliverDueNotifications(), deliverDueNotifications()]);

    expect(a.claimed + b.claimed).toBe(1);
    expect(calls).toHaveLength(2); // enqueue's attempt + exactly one retry
    expect((await rowFor("e@example.test")).status).toBe("enviado");
  });

  it("stops retrying once the attempt budget is spent, and says so", async () => {
    stubTransport({ ok: false, status: 503 });
    await enqueueEmail({ kind: "payment_approved", to: "f@example.test", subject: "s", html: "<p>x</p>" });

    for (let i = 0; i < 10; i++) {
      const row = await rowFor("f@example.test");
      if (row.status !== "pendiente") break;
      await makeDue(row.id);
      await deliverDueNotifications();
    }

    const row = await rowFor("f@example.test");
    expect(row.status).toBe("fallido");
    expect(row.nextAttemptAt).toBeNull();
    expect(row.lastError).toContain("sin reintentos");
  });
});

describe("backoffice view of the outbox", () => {
  it("requeues a failed message and then delivers it", async () => {
    // The configuration-was-broken-and-is-now-fixed path. It matters most for the Hoja de
    // Reclamación: that email is the consumer's legal constancia of their filing.
    stubTransport({ ok: false, status: 422 });
    await enqueueEmail({
      kind: "complaint_filed",
      to: "consumidor@example.test",
      subject: "Registramos tu reclamo",
      html: "<p>constancia</p>",
    });

    const failed = await rowFor("consumidor@example.test");
    expect(failed.status).toBe("fallido");

    const requeued = await requeueDeliveryRecord(failed.id);
    expect(requeued?.status).toBe("pendiente");
    expect(requeued?.attempts).toBe(0);

    stubTransport({ ok: true, status: 200 });
    const report = await deliverDueNotifications();
    expect(report.sent).toBe(1);
    expect((await rowFor("consumidor@example.test")).status).toBe("enviado");
  });

  it("refuses to requeue a message that already went out", async () => {
    // Requeueing a delivered message would send it a second time. The customer reads that as
    // a duplicate order, not as a retry.
    stubTransport({ ok: true, status: 200 });
    await enqueueEmail({ kind: "payment_approved", to: "g@example.test", subject: "s", html: "<p>x</p>" });
    const sent = await rowFor("g@example.test");

    expect(await requeueDeliveryRecord(sent.id)).toBeUndefined();
    expect((await rowFor("g@example.test")).status).toBe("enviado");
  });

  it("never exposes the rendered message body to the panel", async () => {
    // The body holds the customer's name, address and order contents. "Did this go out" is
    // answerable without it, so it is not in the DTO at all.
    stubTransport({ ok: true, status: 200 });
    await enqueueEmail({
      kind: "payment_approved",
      to: "h@example.test",
      subject: "s",
      html: "<p>Av. Secreta 123</p>",
    });

    const [record] = await listDeliveryRecords({ status: "enviado" });
    expect(record).toBeDefined();
    expect(JSON.stringify(record)).not.toContain("Av. Secreta");
  });

  it("filters by what the message was about", async () => {
    stubTransport({ ok: true, status: 200 });
    const orderId = crypto.randomUUID();
    await enqueueEmail({
      kind: "payment_approved",
      to: "i@example.test",
      subject: "s",
      html: "<p>x</p>",
      relatedType: "order",
      relatedId: orderId,
    });
    await enqueueEmail({
      kind: "complaint_filed",
      to: "j@example.test",
      subject: "s",
      html: "<p>x</p>",
      relatedType: "complaint",
      relatedId: crypto.randomUUID(),
    });

    const forOrder = await listDeliveryRecords({ relatedType: "order", relatedId: orderId });
    expect(forOrder).toHaveLength(1);
    expect(forOrder[0]!.recipient).toBe("i@example.test");
  });
});

describe("outbox durability", () => {
  it("recovers a message left claimed by a worker that died mid-send", async () => {
    // The claim is a lease. A process killed between claiming and recording an outcome must
    // not strand its rows: after the lease expires the next run picks them up.
    stubTransport({ ok: true, status: 200 });
    await enqueueEmail({ kind: "payment_approved", to: "k@example.test", subject: "s", html: "<p>x</p>" });

    // Simulate the crash: the row is back to pending with its lease still in the future.
    const row = await rowFor("k@example.test");
    await db
      .update(notificationDeliveries)
      .set({ status: "pendiente", sentAt: null, nextAttemptAt: sql`now() + interval '5 minutes'` })
      .where(eq(notificationDeliveries.id, row.id));

    expect((await deliverDueNotifications()).claimed).toBe(0); // still leased
    await makeDue(row.id); // lease expired
    expect((await deliverDueNotifications()).claimed).toBe(1);
  });
});
