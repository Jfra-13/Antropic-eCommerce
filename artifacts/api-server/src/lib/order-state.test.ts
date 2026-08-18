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

  it("treats `pagado` as terminal — paid money is not un-paid by a state change", () => {
    expect(canTransitionPayment("pagado", "rechazado")).toBe(false);
    expect(canTransitionPayment("pagado", "en_verificacion")).toBe(false);
    expect(canTransitionPayment("pagado", "pendiente_pago")).toBe(false);
  });

  it("refuses to go backwards from verification", () => {
    expect(canTransitionPayment("en_verificacion", "pendiente_pago")).toBe(false);
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
