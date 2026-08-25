// Single source of truth for environment configuration.
//
// Every variable the server needs is declared, parsed and validated HERE, once, at module
// load. index.ts imports this before anything else, so a misconfigured deployment dies at
// startup with a complete list of what is wrong — instead of booting fine and then throwing
// halfway through a checkout because the one code path that reads a missing key finally ran.
//
// Two rules for adding a variable:
//   1. Required means the server genuinely cannot serve correct responses without it.
//   2. Optional means there is a defined, intentional degraded behaviour (see RESEND_*).

const missing: string[] = [];
const invalid: string[] = [];

function required(name: string): string {
  const raw = process.env[name]?.trim();
  if (!raw) {
    missing.push(name);
    return "";
  }
  return raw;
}

function optional(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw ? raw : undefined;
}

function requiredPort(name: string): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    missing.push(name);
    return 0;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    invalid.push(`${name}: expected an integer between 1 and 65535, got "${raw}"`);
    return 0;
  }
  return port;
}

// Comma-separated allowlist of browser origins permitted to call this API.
//
// Production fails closed: an unset list is a configuration error, not a licence to accept
// every origin. Development defaults to "any localhost port" because the dev servers take
// their port on the command line, so the exact origins are not known ahead of time.
function parseCorsOrigins(name: string, isProduction: boolean): string[] | "localhost" {
  const raw = process.env[name]?.trim();
  if (!raw) {
    if (isProduction) missing.push(name);
    return "localhost";
  }
  const origins = raw
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);

  if (origins.length === 0) {
    invalid.push(`${name}: set but contains no origins`);
    return [];
  }
  for (const origin of origins) {
    try {
      new URL(origin);
    } catch {
      invalid.push(`${name}: "${origin}" is not a valid origin (expected e.g. https://tienda.com)`);
    }
  }
  return origins;
}

// Express `trust proxy`. Getting this wrong breaks rate limiting in one of two ways:
// too low and every request looks like it came from the reverse proxy (one shared bucket,
// so one noisy client locks out everyone); too high and a client can forge X-Forwarded-For
// to get a fresh bucket per request. Default false = no proxy, which is correct for local
// development and safe (never spoofable) everywhere else.
function parseTrustProxy(name: string): boolean | number | string {
  const raw = process.env[name]?.trim();
  if (!raw || raw === "false") return false;
  if (raw === "true") return true; // documented as unsafe unless the proxy strips XFF
  const hops = Number(raw);
  if (Number.isInteger(hops) && hops >= 0) return hops;
  return raw; // named preset or CIDR, e.g. "loopback", "10.0.0.0/8"
}

const nodeEnv = optional("NODE_ENV") ?? "development";
const isProduction = nodeEnv === "production";

export const env = {
  NODE_ENV: nodeEnv,
  isProduction,
  PORT: requiredPort("PORT"),
  DATABASE_URL: required("DATABASE_URL"),
  SUPABASE_URL: required("SUPABASE_URL"),
  // Required at startup on purpose: signing Storage uploads and provisioning employee
  // accounts both need it, and discovering that at the moment an admin clicks "upload"
  // is strictly worse than discovering it at boot.
  SUPABASE_SERVICE_ROLE_KEY: required("SUPABASE_SERVICE_ROLE_KEY"),
  CORS_ORIGINS: parseCorsOrigins("CORS_ORIGINS", isProduction),
  TRUST_PROXY: parseTrustProxy("TRUST_PROXY"),
  LOG_LEVEL: optional("LOG_LEVEL") ?? "info",
  // Public storefront origin. Two consumers, one value on purpose: transactional email
  // builds its "ver mi pedido" link from it (unset drops the button rather than rendering a
  // broken link), and the sitemap builds every <loc> from it (unset returns 503 rather than
  // publishing URLs on a guessed origin). It overrides brand.siteUrl the same way
  // VITE_PUBLIC_SITE_URL does in the storefront, so a staging deployment describes itself.
  STORE_URL: optional("STORE_URL"),
  // Optional: with either unset, every message is still recorded in the outbox and marked
  // failed with "sin configurar" rather than silently dropped, so the backlog is visible and
  // can be requeued from the backoffice once email is provisioned (see lib/notify.ts).
  RESEND_API_KEY: optional("RESEND_API_KEY"),
  RESEND_FROM: optional("RESEND_FROM"),
  ADMIN_NOTIFICATION_EMAIL: optional("ADMIN_NOTIFICATION_EMAIL"),
} as const;

// Report everything wrong at once. Fixing one variable per restart is a miserable loop.
if (missing.length > 0 || invalid.length > 0) {
  const problems = [
    ...missing.map((name) => `  - ${name} is required but was not set`),
    ...invalid.map((detail) => `  - ${detail}`),
  ];
  throw new Error(
    `Invalid environment configuration:\n${problems.join("\n")}\n\n` +
      `See .env.example for what each variable is for.`,
  );
}
