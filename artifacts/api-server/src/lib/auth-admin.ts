// Supabase Auth Admin (server-side, service-role). Provisions auth users so an admin can
// create an employee. Hits the GoTrue Admin REST endpoint directly with the service-role key
// — same approach as storage.ts, no @supabase/supabase-js dependency for one call.
const SUPABASE_URL = process.env["SUPABASE_URL"];

function serviceRoleKey(): string {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL must be set to manage auth users.");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set to manage auth users.");
  return key;
}

export type CreateAuthUserResult =
  | { ok: true; id: string; email: string }
  | { ok: false; conflict: boolean; message: string };

// Creates a confirmed auth user with no password — the employee signs in via magic link /
// Google, exactly like customers. Returns conflict=true when the email is already registered.
export async function createAuthUser(email: string): Promise<CreateAuthUserResult> {
  const key = serviceRoleKey();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, email_confirm: true }),
  });

  if (!res.ok) {
    const message = await res.text();
    // GoTrue returns 422 when the email is already registered.
    return { ok: false, conflict: res.status === 422, message };
  }

  const body = (await res.json()) as { id: string; email: string };
  return { ok: true, id: body.id, email: body.email };
}
