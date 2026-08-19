// Cookie consent state — Ley 29733 + D.S. 016-2024-JUS.
//
// The stored decision is a local cache so the banner does not reappear on every page; the
// authoritative record is the row written server-side to the consent ledger. If the two ever
// disagree, the server is right — this file only decides whether to show a banner.
//
// The decision is pinned to the version of the legal texts it was made against. When the
// business publishes new texts the version changes, this cache stops matching, and the banner
// asks again. That is deliberate: consent to a document nobody has read is not consent.

// Brand-neutral on purpose. localStorage is already scoped to the origin, so namespacing the
// key by brand buys nothing — and a key carrying the brand name is one more thing a rebrand
// would have to remember, with a silently re-prompted consent banner as the failure mode.
const STORAGE_KEY = "store.cookie-consent";

export type ConsentDecision = {
  policyVersion: string;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
};

export function readConsent(): ConsentDecision | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentDecision>;
    if (
      typeof parsed.policyVersion !== "string" ||
      typeof parsed.analytics !== "boolean" ||
      typeof parsed.marketing !== "boolean"
    ) {
      return null;
    }
    return parsed as ConsentDecision;
  } catch {
    // Corrupt or unavailable storage (private mode, quota) → treat as "not decided" and ask.
    return null;
  }
}

export function writeConsent(decision: ConsentDecision): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decision));
  } catch {
    // Storage refused. The server-side record still stands; the banner will simply ask again.
  }
}

// Gate for any third-party script that is not strictly necessary. GA4, Meta Pixel and TikTok
// must call this and get `true` BEFORE they are loaded — the reglamento requires non-essential
// trackers to stay off until the user has actively agreed. There are no such scripts in the
// storefront today; this exists so the first one added has an obvious correct way in.
export function hasConsent(purpose: "analytics" | "marketing", policyVersion: string): boolean {
  const decision = readConsent();
  if (!decision || decision.policyVersion !== policyVersion) return false;
  return purpose === "analytics" ? decision.analytics : decision.marketing;
}
