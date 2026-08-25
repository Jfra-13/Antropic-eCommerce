import { logger } from "./logger";

// The single place an unexpected error is reported from (auditoría §5).
//
// There is deliberately NO error-tracking SaaS wired in here. Adding a Sentry SDK with no
// account, no DSN and no way to exercise it in this environment would produce exactly the kind
// of code this project has been removing: it compiles, it reads well, and it does nothing.
// The audit item stays open on purpose.
//
// What this function buys today is the seam. Every unhandled error in the API and in the
// scheduled jobs goes through here, so the day there IS a DSN, the integration is one function
// body — not an audit of every catch block in the codebase.
//
// To plug in a provider later:
//   1. Add the SDK to artifacts/api-server/package.json and initialise it in index.ts, BEFORE
//      app.ts is imported (most SDKs instrument globals at init and miss anything loaded first).
//   2. Add the capture call to the body below, keeping the logger.error line: the log is the
//      only trace left when the provider is down or the quota is spent.
//   3. Declare its DSN in lib/env.ts as OPTIONAL. An error reporter that stops the server from
//      booting when it is misconfigured is worse than no error reporter.
//
// `context` is for whatever identifies the failure — requestId, orderId, job name. Never put
// a JWT, an email body or a payment payload in it: this is the object that would be shipped
// off-site the moment a provider is connected.
export function reportError(err: unknown, context: Record<string, unknown> = {}): void {
  logger.error({ err, ...context }, "reported error");
}
