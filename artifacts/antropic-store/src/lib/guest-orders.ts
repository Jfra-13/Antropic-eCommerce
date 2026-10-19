// Access tokens of the guest orders placed from this browser (auditoría §1.4).
//
// A guest has no session, so an order is opened with its token instead: the one returned when
// it is placed, or the one inside the link of the confirmation email. Keeping it here means a
// guest who closes the tab — to go and pay with Yape, typically — finds the order again on
// return without digging out the email. Losing it costs nothing worse: the email still works.
//
// Per-device by nature, like the guest cart. Wrapped in try/catch because storage can be
// unavailable (private mode, blocked site data) and a missing convenience must not break the
// order screen.
const KEY = "store.guestOrders.v1";

type Tokens = Record<string, string>;

function read(): Tokens {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Tokens) : {};
  } catch {
    return {};
  }
}

export function rememberGuestOrder(orderId: string, token: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [orderId]: token }));
  } catch {
    // Nothing to do: the emailed link still opens the order.
  }
}

export function guestOrderToken(orderId: string): string | null {
  const token = read()[orderId];
  return typeof token === "string" && token.length > 0 ? token : null;
}

// What POST /me/guest-orders/claim takes: holding an order's token is what proves it is yours.
// Capped at the API's limit (50), newest first — older orders stay reachable by their link.
export function guestOrderPairs(): { orderId: string; accessToken: string }[] {
  return Object.entries(read())
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .slice(-50)
    .map(([orderId, accessToken]) => ({ orderId, accessToken }));
}

// The header the /guest/orders endpoints read. Sent as a header, never in the URL, so the token
// stays out of server logs (see the API's modules/orders/guest-access.ts).
export function guestOrderRequest(token: string): RequestInit {
  return { headers: { "X-Order-Token": token } };
}
