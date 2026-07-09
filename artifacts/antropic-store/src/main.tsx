import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Dev: storefront and API run on different ports. Prod: front (Vercel) and API
// (DigitalOcean) are different origins. Both cases use VITE_API_URL; when unset,
// requests stay same-origin relative to `/api`.
setBaseUrl(import.meta.env.VITE_API_URL ?? null);

createRoot(document.getElementById("root")!).render(<App />);
