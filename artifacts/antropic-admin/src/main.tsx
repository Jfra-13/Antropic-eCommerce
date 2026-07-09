import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { supabase } from "./lib/supabase";
import App from "./App";
import "./index.css";

// The API is a different origin (dev: different port; prod: DigitalOcean vs Vercel).
// VITE_API_URL points at it; unset means same-origin under /api.
setBaseUrl(import.meta.env.VITE_API_URL ?? null);

// Every API call carries the Supabase session JWT as a bearer token. getSession() reads the
// cached session and refreshes it if expired — no network call on the common path.
setAuthTokenGetter(async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
