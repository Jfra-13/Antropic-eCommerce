import { createClient } from "@supabase/supabase-js";

// The anon key is safe to ship in the browser bundle — it only grants access under
// Supabase RLS, and this app never talks to the DB directly (all data goes through
// api-server). The client is used purely for auth (session + JWT for the API).
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required. " +
      "Set them in artifacts/antropic-store/.env (see .env.example).",
  );
}

export const supabase = createClient(url, anonKey);
