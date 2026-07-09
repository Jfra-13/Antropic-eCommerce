import { randomUUID } from "node:crypto";

// Signed upload URL to the PRIVATE payment-proofs bucket. The frontend PUTs the file
// directly to Storage with this URL, so the service-role key never leaves the server and
// the file never transits the API. Uses the Storage REST endpoint directly — no need for
// the @supabase/supabase-js dependency for one call.
const SUPABASE_URL = process.env["SUPABASE_URL"];
const BUCKET = "payment-proofs";

function serviceRoleKey(): string {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL must be set to sign Storage uploads.");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set to sign Storage uploads.");
  return key;
}

export type SignedUpload = { uploadUrl: string; path: string; token: string };

export async function createProofUploadUrl(orderId: string): Promise<SignedUpload> {
  const key = serviceRoleKey();
  const path = `${orderId}/${randomUUID()}`;

  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${path}`,
    { method: "POST", headers: { Authorization: `Bearer ${key}`, apikey: key } },
  );
  if (!res.ok) {
    throw new Error(`Storage sign failed (${res.status}): ${await res.text()}`);
  }

  // Response: { url: "/object/upload/sign/{bucket}/{path}?token=<jwt>" }
  const body = (await res.json()) as { url: string };
  const token = new URL(body.url, SUPABASE_URL).searchParams.get("token") ?? "";
  return { uploadUrl: `${SUPABASE_URL}/storage/v1${body.url}`, path, token };
}
