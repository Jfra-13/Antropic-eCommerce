import type { Order } from "@workspace/db";
import { toCents } from "../../lib/money";
import { getSetting } from "./queries";

const DELIVERY_FEE_KEY = "delivery_fee";

// Shipping cost in cents for a delivery method. Recojo is always free. Delivery reads the
// flat La Molina tariff from settings (the business sets it in the admin panel). If unset,
// it's 0 until configured — non-blocking per planeación §10.
// ponytail: flat fee from KV; a per-zone Strategy only if the tariff ever becomes zonal.
export async function getShippingCostCents(
  deliveryMethod: Order["deliveryMethod"],
): Promise<number> {
  if (deliveryMethod === "recojo") return 0;

  const value = await getSetting(DELIVERY_FEE_KEY);
  if (typeof value === "string") return toCents(value);
  if (typeof value === "number") return Math.round(value * 100);
  return 0;
}
