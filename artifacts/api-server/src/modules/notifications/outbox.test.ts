import { describe, it, expect } from "vitest";
import { outcomeForFailure, outboxTuning } from "./outbox";

// The retry schedule, checked without a database. What makes this worth a test: both failure
// modes are silent. One retry too few and a message is abandoned during a provider blip; one
// too many — or a budget that never runs out — and a permanently undeliverable address is
// retried forever, which is how a queue stops draining.

describe("outbox retry schedule", () => {
  it("keeps a retryable failure queued and backs off further on each attempt", () => {
    const first = outcomeForFailure(1, true, "HTTP 503");
    const second = outcomeForFailure(2, true, "HTTP 503");

    expect(first.status).toBe("pendiente");
    expect(second.status).toBe("pendiente");
    if (first.status !== "pendiente" || second.status !== "pendiente") return;

    // Strictly later, not just different: the whole point of backoff is that a provider having
    // a bad minute is not hammered every minute.
    expect(second.nextAttemptAt.getTime()).toBeGreaterThan(first.nextAttemptAt.getTime());
  });

  it("gives up once the attempt budget is spent", () => {
    const lastAllowed = outcomeForFailure(outboxTuning.MAX_ATTEMPTS - 1, true, "HTTP 503");
    const spent = outcomeForFailure(outboxTuning.MAX_ATTEMPTS, true, "HTTP 503");

    expect(lastAllowed.status).toBe("pendiente");
    expect(spent.status).toBe("fallido");
  });

  it("does not spend the budget on a failure that will never succeed", () => {
    // A rejected address or a missing API key fails identically on every attempt. Retrying it
    // five times only delays the moment somebody sees the failure in the backoffice.
    const outcome = outcomeForFailure(1, false, "HTTP 422 invalid recipient");
    expect(outcome.status).toBe("fallido");
  });

  it("schedules every retry into the future", () => {
    for (let attempt = 1; attempt < outboxTuning.MAX_ATTEMPTS; attempt++) {
      const outcome = outcomeForFailure(attempt, true, "boom");
      if (outcome.status !== "pendiente") throw new Error(`attempt ${attempt} was terminal`);
      expect(outcome.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    }
  });
});
