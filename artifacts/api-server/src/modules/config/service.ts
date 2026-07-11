import type { PickupPoint as PickupPointRow } from "@workspace/db";
import type {
  AdminConfig,
  PublicConfig,
  Banner,
  UpdateConfigInput,
  PickupPoint as PickupPointDto,
  PickupPointList,
  CreatePickupPointInput,
  UpdatePickupPointInput,
} from "@workspace/api-zod";
import { publicMediaUrl } from "../../lib/storage";
import {
  getSetting,
  setSetting,
  listPickupPoints,
  insertPickupPoint,
  updatePickupPointRow,
  getPickupPointById,
  pickupPointReferenced,
  deletePickupPointRow,
} from "./queries";

// Settings keys. `delivery_fee` and `free_shipping_threshold` are also read by the
// shipping module at quote/order time — keep in sync.
const KEY_DELIVERY_FEE = "delivery_fee";
const KEY_FREE_SHIPPING_THRESHOLD = "free_shipping_threshold";
const KEY_YAPE = "yape";
const KEY_BANNERS = "banners";
const KEY_HERO = "hero";
const KEY_PROMO_TEXT = "promo_text";
const KEY_EDITORIAL = "editorial";

type YapeSetting = { number: string | null; qrPath: string | null };
type HeroSetting = { title: string | null; subtitle: string | null };
type EditorialSetting = { tag: string | null; title: string | null; imagePath: string | null };

function moneyOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (typeof value === "number") return value.toFixed(2);
  return null;
}

// Reads the config settings and normalizes them into the admin shape (paths, not URLs).
async function readConfig(): Promise<AdminConfig> {
  const [fee, threshold, yape, banners, hero, promoText, editorial] = await Promise.all([
    getSetting(KEY_DELIVERY_FEE),
    getSetting(KEY_FREE_SHIPPING_THRESHOLD),
    getSetting(KEY_YAPE),
    getSetting(KEY_BANNERS),
    getSetting(KEY_HERO),
    getSetting(KEY_PROMO_TEXT),
    getSetting(KEY_EDITORIAL),
  ]);

  const y = (yape ?? {}) as Partial<YapeSetting>;
  const h = (hero ?? {}) as Partial<HeroSetting>;
  const e = (editorial ?? {}) as Partial<EditorialSetting>;
  const bannerList = Array.isArray(banners) ? (banners as Banner[]) : [];

  return {
    deliveryFee: moneyOrNull(fee) ?? "0.00",
    freeShippingThreshold: moneyOrNull(threshold),
    yapeNumber: y.number ?? null,
    yapeQrPath: y.qrPath ?? null,
    banners: bannerList,
    hero: { title: h.title ?? null, subtitle: h.subtitle ?? null },
    promoText: typeof promoText === "string" && promoText.trim() !== "" ? promoText : null,
    editorial: { tag: e.tag ?? null, title: e.title ?? null, imagePath: e.imagePath ?? null },
  };
}

export function getAdminConfig(): Promise<AdminConfig> {
  return readConfig();
}

// Public shape: storage paths become public read URLs, inactive banners are dropped.
export async function getPublicConfig(): Promise<PublicConfig> {
  const c = await readConfig();
  return {
    deliveryFee: c.deliveryFee,
    freeShippingThreshold: c.freeShippingThreshold,
    yapeNumber: c.yapeNumber,
    yapeQrUrl: c.yapeQrPath ? publicMediaUrl(c.yapeQrPath) : null,
    banners: c.banners.filter((b) => b.active).map((b) => ({ imageUrl: publicMediaUrl(b.path) })),
    hero: c.hero,
    promoText: c.promoText,
    editorial: {
      tag: c.editorial.tag,
      title: c.editorial.title,
      imageUrl: c.editorial.imagePath ? publicMediaUrl(c.editorial.imagePath) : null,
    },
  };
}

export async function updateConfig(input: UpdateConfigInput): Promise<AdminConfig> {
  if (input.deliveryFee !== undefined) {
    await setSetting(KEY_DELIVERY_FEE, input.deliveryFee);
  }
  if (input.freeShippingThreshold !== undefined) {
    await setSetting(KEY_FREE_SHIPPING_THRESHOLD, input.freeShippingThreshold);
  }
  // Yape number and QR share one setting object; merge partial updates over current values.
  if (input.yapeNumber !== undefined || input.yapeQrPath !== undefined) {
    const cur = await readConfig();
    const next: YapeSetting = {
      number: input.yapeNumber !== undefined ? input.yapeNumber : cur.yapeNumber,
      qrPath: input.yapeQrPath !== undefined ? input.yapeQrPath : cur.yapeQrPath,
    };
    await setSetting(KEY_YAPE, next);
  }
  if (input.banners !== undefined) {
    await setSetting(KEY_BANNERS, input.banners);
  }
  if (input.hero !== undefined) {
    await setSetting(KEY_HERO, input.hero);
  }
  if (input.promoText !== undefined) {
    await setSetting(KEY_PROMO_TEXT, input.promoText);
  }
  if (input.editorial !== undefined) {
    await setSetting(KEY_EDITORIAL, input.editorial);
  }
  return readConfig();
}

// --- Pickup points ---

function toPickupDto(p: PickupPointRow): PickupPointDto {
  return {
    id: p.id,
    name: p.name,
    address: p.address,
    active: p.active,
    createdAt: p.createdAt,
  };
}

export async function getPickupPoints(activeOnly: boolean): Promise<PickupPointList> {
  const rows = await listPickupPoints(activeOnly);
  return { items: rows.map(toPickupDto) };
}

export async function createPickupPoint(input: CreatePickupPointInput): Promise<PickupPointDto> {
  const row = await insertPickupPoint({
    name: input.name,
    address: input.address,
    active: input.active ?? true,
  });
  return toPickupDto(row);
}

export type UpdatePickupResult =
  | { ok: true; point: PickupPointDto }
  | { ok: false; status: number; code: string; message: string };

export async function updatePickupPoint(
  id: string,
  input: UpdatePickupPointInput,
): Promise<UpdatePickupResult> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch["name"] = input.name;
  if (input.address !== undefined) patch["address"] = input.address;
  if (input.active !== undefined) patch["active"] = input.active;

  if (Object.keys(patch).length === 0) {
    const current = await getPickupPointById(id);
    if (!current) return { ok: false, status: 404, code: "NOT_FOUND", message: "Pickup point not found" };
    return { ok: true, point: toPickupDto(current) };
  }

  const row = await updatePickupPointRow(id, patch);
  if (!row) return { ok: false, status: 404, code: "NOT_FOUND", message: "Pickup point not found" };
  return { ok: true, point: toPickupDto(row) };
}

export type DeletePickupResult =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

export async function deletePickupPoint(id: string): Promise<DeletePickupResult> {
  // Orders reference pickup points (no cascade); soft-deactivate instead of orphaning history.
  if (await pickupPointReferenced(id)) {
    return {
      ok: false,
      status: 409,
      code: "REFERENCED",
      message: "Pickup point is referenced by orders; deactivate it instead of deleting",
    };
  }
  const deleted = await deletePickupPointRow(id);
  if (!deleted) return { ok: false, status: 404, code: "NOT_FOUND", message: "Pickup point not found" };
  return { ok: true };
}
