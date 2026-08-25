import { describe, it, expect, vi, afterEach } from "vitest";

// The transport's contract, checked without a network. What matters here is not that fetch is
// called — it is the classification: which failures are worth another attempt and which are
// not. Get that wrong and the outbox either abandons recoverable messages or retries a dead
// address until somebody notices the queue never drains.

vi.mock("./env", () => ({
  env: { RESEND_API_KEY: undefined, RESEND_FROM: undefined, LOG_LEVEL: "silent", isProduction: false },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("email transport with RESEND unset", () => {
  it("reports a non-retryable failure instead of pretending it sent", async () => {
    // Running without email configured is a supported state (local development, and production
    // before the sending domain is verified). It used to be a logged no-op, which is how a
    // store discovers months later that no customer ever received a confirmation. Now every
    // message is still recorded, marked failed with a readable reason, and requeueable once
    // email is provisioned.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { sendEmail } = await import("./notify");
    const result = await sendEmail({ to: "a@example.test", subject: "s", html: "<p>x</p>" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.retryable).toBe(false); // no key will still be no key in five minutes
    expect(result.error).toContain("sin configurar");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
