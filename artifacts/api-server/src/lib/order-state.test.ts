import { describe, it, expect } from "vitest";
import { canTransitionPayment, canTransitionFulfillment } from "./order-state";

// These machines are what stop an order from being marked paid without anyone verifying the
// constancia, and what keeps a delivery order out of the pickup track. Both are money- and
// stock-bearing, so the tests assert the transitions that must NOT be possible as hard as the
// ones that must.

describe("payment transitions", () => {
  it("allows the customer's only move: attaching a proof", () => {
    expect(canTransitionPayment("pendiente_pago", "en_verificacion")).toBe(true);
  });

  it("refuses to mark an order paid without passing through verification", () => {
    // This is the whole point of the manual flow: no path to `pagado` skips a human.
    expect(canTransitionPayment("pendiente_pago", "pagado")).toBe(false);
  });

  it("lets the backoffice approve or reject from verification", () => {
    expect(canTransitionPayment("en_verificacion", "pagado")).toBe(true);
    expect(canTransitionPayment("en_verificacion", "rechazado")).toBe(true);
  });

  it("lets a rejected order re-enter verification with a new proof", () => {
    expect(canTransitionPayment("rechazado", "en_verificacion")).toBe(true);
  });

  it("never un-pays a paid order — a refund is a new state, not a reversal", () => {
    // `reembolsado` was added in fase 6 and is the ONLY exit from `pagado`. These three stay
    // impossible: rewinding an approved order to any pre-payment state would silently detach
    // it from the stock that was already decremented for it.
    expect(canTransitionPayment("pagado", "rechazado")).toBe(false);
    expect(canTransitionPayment("pagado", "en_verificacion")).toBe(false);
    expect(canTransitionPayment("pagado", "pendiente_pago")).toBe(false);
    expect(canTransitionPayment("pagado", "reembolsado")).toBe(true);
  });

  it("refuses to go backwards from verification", () => {
    expect(canTransitionPayment("en_verificacion", "pendiente_pago")).toBe(false);
  });

  // --- States prepared for a payment gateway (fase 6, auditoría §6.2) ---------------
  // Nothing produces `autorizado` or `reembolsado` yet. They are asserted here so that the
  // graph a gateway will need is pinned down now, while the manual flow is the only thing
  // that can be broken by getting it wrong.

  it("expires an order nobody paid, and treats expiry as terminal", () => {
    expect(canTransitionPayment("pendiente_pago", "expirado")).toBe(true);
    // A rejected constancia leaves the order waiting on the customer just like an unpaid one.
    expect(canTransitionPayment("rechazado", "expirado")).toBe(true);
    expect(canTransitionPayment("expirado", "pendiente_pago")).toBe(false);
    expect(canTransitionPayment("expirado", "en_verificacion")).toBe(false);
    expect(canTransitionPayment("expirado", "pagado")).toBe(false);
  });

  it("NEVER expires an order whose constancia is awaiting review", () => {
    // The one that matters. An order in verification has a proof attached, so the customer
    // may have sent real money that nobody has looked at yet. A timer must not be able to
    // close it — only a person approving or rejecting can.
    expect(canTransitionPayment("en_verificacion", "expirado")).toBe(false);
  });

  it("models a gateway's authorise-then-capture, including the authorisation lapsing", () => {
    expect(canTransitionPayment("pendiente_pago", "autorizado")).toBe(true);
    expect(canTransitionPayment("autorizado", "pagado")).toBe(true);
    expect(canTransitionPayment("autorizado", "rechazado")).toBe(true);
    expect(canTransitionPayment("autorizado", "expirado")).toBe(true);
  });

  it("keeps the manual and gateway tracks from crossing", () => {
    // A constancia under review is not an authorisation, and vice versa.
    expect(canTransitionPayment("en_verificacion", "autorizado")).toBe(false);
    expect(canTransitionPayment("autorizado", "en_verificacion")).toBe(false);
  });

  it("treats a refund as final — refunding twice is not a state change", () => {
    expect(canTransitionPayment("reembolsado", "pagado")).toBe(false);
    expect(canTransitionPayment("reembolsado", "reembolsado")).toBe(false);
  });

  it("leaves no state without an explicit entry in the map", () => {
    // Adding a value to the payment_status enum without deciding its transitions would make
    // canTransitionPayment throw on `undefined.includes` at runtime, in the middle of the
    // transaction that moves money. Fail here instead.
    const ALL: Parameters<typeof canTransitionPayment>[0][] = [
      "pendiente_pago",
      "en_verificacion",
      "pagado",
      "rechazado",
      "autorizado",
      "expirado",
      "reembolsado",
    ];
    for (const from of ALL) {
      for (const to of ALL) {
        expect(() => canTransitionPayment(from, to)).not.toThrow();
      }
    }
  });
});

describe("fulfillment transitions", () => {
  it("walks the delivery track", () => {
    expect(canTransitionFulfillment("en_preparacion", "enviado")).toBe(true);
    expect(canTransitionFulfillment("enviado", "entregado")).toBe(true);
  });

  it("walks the pickup track", () => {
    expect(canTransitionFulfillment("recojo_pendiente", "recogido")).toBe(true);
  });

  it("never lets an order cross between the delivery and pickup tracks", () => {
    // The from-state implies the track, so the map alone has to keep them apart.
    expect(canTransitionFulfillment("en_preparacion", "recogido")).toBe(false);
    expect(canTransitionFulfillment("recojo_pendiente", "enviado")).toBe(false);
    expect(canTransitionFulfillment("enviado", "recogido")).toBe(false);
  });

  it("allows cancelling only before the goods have moved", () => {
    expect(canTransitionFulfillment("en_preparacion", "cancelado")).toBe(true);
    expect(canTransitionFulfillment("recojo_pendiente", "cancelado")).toBe(true);
    // Already shipped or already handed over: cancelling is a return, not a state change.
    expect(canTransitionFulfillment("enviado", "cancelado")).toBe(false);
    expect(canTransitionFulfillment("entregado", "cancelado")).toBe(false);
  });

  it("treats delivered, picked up and cancelled as terminal", () => {
    expect(canTransitionFulfillment("entregado", "enviado")).toBe(false);
    expect(canTransitionFulfillment("recogido", "recojo_pendiente")).toBe(false);
    expect(canTransitionFulfillment("cancelado", "en_preparacion")).toBe(false);
  });
});
