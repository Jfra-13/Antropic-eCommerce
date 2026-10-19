import { describe, it, expect } from "vitest";
import { isProofPathForOrder } from "./storage";
import { orderLink } from "../modules/notifications/templates";
import { generateGuestAccessToken } from "../modules/orders/guest-access";

// The pure decisions guest checkout rests on (auditoría §1.4). Each one, if wrong, fails open:
// a proof path from another order would "pay" this one, and a link without its token is a dead
// end for a customer who has no other way back.

const ORDER = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const OTHER = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
const OBJECT = "11111111-2222-4333-8444-555555555555";

describe("isProofPathForOrder", () => {
  it("accepts exactly the shape the upload-url endpoint issues for the order", () => {
    expect(isProofPathForOrder(`${ORDER}/${OBJECT}`, ORDER)).toBe(true);
    expect(isProofPathForOrder(`${ORDER.toUpperCase()}/${OBJECT}`, ORDER)).toBe(true);
  });

  it("refuses an upload issued for another order", () => {
    expect(isProofPathForOrder(`${OTHER}/${OBJECT}`, ORDER)).toBe(false);
  });

  it("refuses anything that is not a plain {order}/{object} path", () => {
    expect(isProofPathForOrder(`${ORDER}/../${OTHER}/${OBJECT}`, ORDER)).toBe(false);
    expect(isProofPathForOrder(`${ORDER}/${OBJECT}/extra`, ORDER)).toBe(false);
    expect(isProofPathForOrder(`x/${ORDER}/${OBJECT}`, ORDER)).toBe(false);
    expect(isProofPathForOrder(`${ORDER}/not-a-uuid`, ORDER)).toBe(false);
    expect(isProofPathForOrder("", ORDER)).toBe(false);
  });
});

describe("orderLink", () => {
  const base = "https://tienda.example";

  it("sends an account order to the logged-in order screen", () => {
    expect(orderLink(base, { id: ORDER, guestAccessToken: null })).toBe(`${base}/orders/${ORDER}`);
  });

  it("puts a guest order's token in the fragment, never in the path or the query", () => {
    const link = orderLink(base, { id: ORDER, guestAccessToken: "tok_abc" });
    expect(link).toBe(`${base}/pedido/${ORDER}#tok_abc`);
    expect(new URL(link).search).toBe("");
  });
});

describe("generateGuestAccessToken", () => {
  it("is 256 bits of URL-safe randomness, different every time", () => {
    const a = generateGuestAccessToken();
    const b = generateGuestAccessToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
});
