import { createRoot } from "react-dom/client";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { supabase } from "./lib/supabase";
import App from "./App";
import "./index.css";

// Dev: storefront and API run on different ports. Prod: front (Vercel) and API
// (DigitalOcean) are different origins. Both cases use VITE_API_URL; when unset,
// requests stay same-origin relative to `/api`.
setBaseUrl(import.meta.env.VITE_API_URL ?? null);

// The API is cross-origin and token-gated (not cookie-based), so every request
// carries the Supabase session JWT as a bearer token. getSession() reads the cached
// session and refreshes it if expired — no network call on the common path.
setAuthTokenGetter(async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});

createRoot(document.getElementById("root")!).render(<App />);
