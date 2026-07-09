import { createClient } from "@supabase/supabase-js";

// Auth-only Supabase client. The backoffice never touches the DB directly — all data
// flows through api-server, which enforces role authorization. This client only manages
// the staff session and supplies the JWT the API verifies.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required. " +
      "Set them in artifacts/antropic-admin/.env (see .env.example).",
  );
}

export const supabase = createClient(url, anonKey);
