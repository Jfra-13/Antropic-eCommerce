import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import type { Order } from "@workspace/db";
import { GetGuestOrderHeader, GetGuestOrderParams } from "@workspace/api-zod";
import { getOrderById } from "./queries";

// Access to a guest order (auditoría §1.4). A guest has no Supabase session, so the order is
// reached with a capability instead: a random token issued when the order is placed, returned
// to the browser that placed it and emailed inside the "ver mi pedido" link. It opens ONE order
// for reading and for uploading its constancia — never a list, never another order.

// Sent as a header, not in the URL: query strings end up in access logs, proxies and the
// Referer of whatever the page links to. The storefront keeps it in the link's #fragment,
// which browsers never send to any server.
export const GUEST_TOKEN_HEADER = "X-Order-Token";

// 256 bits from the CSPRNG. Unguessable is the whole security model here, so there is no
// shorter "friendlier" variant: the customer never types it, they click it.
export function generateGuestAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

// Constant time over equal-length digests, so neither the content nor the length of the
// stored token leaks through how long a wrong guess takes to be refused.
function tokensMatch(presented: string, stored: string): boolean {
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(stored).digest();
  return timingSafeEqual(a, b);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      guestOrder?: Order;
    }
  }
}

// Resolves `:id` + the token header to the order and attaches it as req.guestOrder.
//
// Every failure is the same 404 — unknown order, account order, missing token, wrong token.
// Telling them apart would let anyone probe which order ids exist, and which of them are guest
// orders worth attacking. The three guest routes share one param/header shape, so the schemas
// generated for getGuestOrder validate all of them.
export const requireGuestOrder: RequestHandler = async (req, res, next) => {
  const params = GetGuestOrderParams.safeParse(req.params);
  const headers = GetGuestOrderHeader.safeParse({
    [GUEST_TOKEN_HEADER]: req.get(GUEST_TOKEN_HEADER),
  });
  const notFound = () => res.status(404).json({ code: "NOT_FOUND", message: "Order not found" });
  if (!params.success || !headers.success) {
    notFound();
    return;
  }

  const order = await getOrderById(params.data.id);
  // An order claimed into an account keeps its token on purpose: the links already sitting in
  // the customer's inbox have to keep working on a device where they are not logged in.
  const presented = headers.data[GUEST_TOKEN_HEADER];
  if (!order?.guestAccessToken || !tokensMatch(presented, order.guestAccessToken)) {
    notFound();
    return;
  }
  req.guestOrder = order;
  next();
};
