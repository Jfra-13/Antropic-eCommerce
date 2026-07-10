import type { Order } from "@workspace/db";
import { toCents } from "../../lib/money";
import { getSetting } from "./queries";

const DELIVERY_FEE_KEY = "delivery_fee";
const FREE_SHIPPING_THRESHOLD_KEY = "free_shipping_threshold";

function settingCents(value: unknown): number | null {
  if (typeof value === "string" && value.trim() !== "") return toCents(value);
  if (typeof value === "number") return Math.round(value * 100);
  return null;
}

// Shipping cost in cents for a delivery method given the order subtotal. Recojo is always
// free. Delivery reads the flat La Molina tariff from settings, and is waived when the
// subtotal reaches the configurable free-shipping threshold (unset threshold = never free).
// Both values are set by the business in the admin panel — non-blocking per planeación §10.
// ponytail: flat fee from KV; a per-zone Strategy only if the tariff ever becomes zonal.
export async function getShippingCostCents(
  deliveryMethod: Order["deliveryMethod"],
  subtotalCents: number,
): Promise<number> {
  if (deliveryMethod === "recojo") return 0;

  const threshold = settingCents(await getSetting(FREE_SHIPPING_THRESHOLD_KEY));
  if (threshold !== null && subtotalCents >= threshold) return 0;

  return settingCents(await getSetting(DELIVERY_FEE_KEY)) ?? 0;
}
