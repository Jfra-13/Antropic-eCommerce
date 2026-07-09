import { randomUUID } from "node:crypto";

// Signed upload URLs to Supabase Storage. The frontend PUTs the file directly with this URL,
// so the service-role key never leaves the server and the file never transits the API. Uses
// the Storage REST endpoint directly — no need for the @supabase/supabase-js dependency.
const SUPABASE_URL = process.env["SUPABASE_URL"];
const PROOF_BUCKET = "payment-proofs"; // private (Yape constancias)
const PUBLIC_BUCKET = "public-media"; // public (Yape QR, banners)

function serviceRoleKey(): string {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL must be set to sign Storage uploads.");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set to sign Storage uploads.");
  return key;
}

export type SignedUpload = { uploadUrl: string; path: string; token: string };

// Sign a direct upload into `bucket` at `path`. Shared by proof and public-media uploads.
async function signUpload(bucket: string, path: string): Promise<SignedUpload> {
  const key = serviceRoleKey();
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/upload/sign/${bucket}/${path}`,
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

export function createProofUploadUrl(orderId: string): Promise<SignedUpload> {
  return signUpload(PROOF_BUCKET, `${orderId}/${randomUUID()}`);
}

// Public read URL for an object in the public bucket (Yape QR, banners). No signing needed.
export function publicMediaUrl(path: string): string {
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL must be set to build public media URLs.");
  return `${SUPABASE_URL}/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`;
}

// Signed upload into the PUBLIC bucket plus the public read URL the object will have.
export async function createPublicMediaUploadUrl(): Promise<SignedUpload & { publicUrl: string }> {
  const signed = await signUpload(PUBLIC_BUCKET, randomUUID());
  return { ...signed, publicUrl: publicMediaUrl(signed.path) };
}

// Signed READ URL for a proof in the private bucket. Employee/admin verify the constancia
// against the Yape payment; the URL expires so the sensitive image is not permanently public.
export async function createProofDownloadUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const key = serviceRoleKey();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${PROOF_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  if (!res.ok) {
    throw new Error(`Storage sign (download) failed (${res.status}): ${await res.text()}`);
  }

  // Response: { signedURL: "/object/sign/{bucket}/{path}?token=<jwt>" }
  const body = (await res.json()) as { signedURL: string };
  return `${SUPABASE_URL}/storage/v1${body.signedURL}`;
}
