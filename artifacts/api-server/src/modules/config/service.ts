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

// Settings keys. `delivery_fee` is also read by the shipping module at order time — keep in sync.
const KEY_DELIVERY_FEE = "delivery_fee";
const KEY_YAPE = "yape";
const KEY_BANNERS = "banners";

type YapeSetting = { number: string | null; qrPath: string | null };

// Reads the three config settings and normalizes them into the admin shape (paths, not URLs).
async function readConfig(): Promise<AdminConfig> {
  const [fee, yape, banners] = await Promise.all([
    getSetting(KEY_DELIVERY_FEE),
    getSetting(KEY_YAPE),
    getSetting(KEY_BANNERS),
  ]);

  const deliveryFee =
    typeof fee === "string" ? fee : typeof fee === "number" ? fee.toFixed(2) : "0.00";
  const y = (yape ?? {}) as Partial<YapeSetting>;
  const bannerList = Array.isArray(banners) ? (banners as Banner[]) : [];

  return {
    deliveryFee,
    yapeNumber: y.number ?? null,
    yapeQrPath: y.qrPath ?? null,
    banners: bannerList,
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
    yapeNumber: c.yapeNumber,
    yapeQrUrl: c.yapeQrPath ? publicMediaUrl(c.yapeQrPath) : null,
    banners: c.banners.filter((b) => b.active).map((b) => ({ imageUrl: publicMediaUrl(b.path) })),
  };
}

export async function updateConfig(input: UpdateConfigInput): Promise<AdminConfig> {
  if (input.deliveryFee !== undefined) {
    await setSetting(KEY_DELIVERY_FEE, input.deliveryFee);
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
