import type { RecordConsentInput } from "@workspace/api-zod";
import { insertConsent } from "./queries";

export type ConsentContext = {
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

// Records one decision about one purpose. The context (who, from where) is supplied by the
// router from the request itself and never by the caller — a consent record the client can
// forge proves nothing.
export async function record(
  input: RecordConsentInput,
  context: ConsentContext,
): Promise<void> {
  await insertConsent({
    userId: context.userId,
    email: input.email ?? null,
    purpose: input.purpose,
    granted: input.granted,
    policyVersion: input.policyVersion,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
}
