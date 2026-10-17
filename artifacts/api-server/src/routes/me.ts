import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, profiles } from "@workspace/db";
import {
  GetMeResponse,
  UpdateMeBody,
  UpdateMeResponse,
  ClaimGuestOrdersResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { claimGuestOrders } from "../modules/orders/service";

const router: IRouter = Router();

// Returns the authenticated caller's profile. Proves the auth pipeline end to end
// (JWT verify -> profile bootstrap -> req.user).
router.get("/me", requireAuth, (req, res) => {
  res.json(GetMeResponse.parse({ user: req.user }));
});

// Self-service profile update (name, phone, shipping address). Email is immutable —
// it is the Supabase auth identity, not profile data.
router.patch("/me", requireAuth, async (req, res) => {
  const body = UpdateMeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }

  const patch: Partial<typeof profiles.$inferInsert> = {};
  if (body.data.fullName !== undefined) patch.fullName = body.data.fullName;
  if (body.data.phone !== undefined) patch.phone = body.data.phone;
  if (body.data.shippingAddress !== undefined) patch.shippingAddress = body.data.shippingAddress;

  const user = req.user!;
  if (Object.keys(patch).length > 0) {
    const updated = await db
      .update(profiles)
      .set(patch)
      .where(eq(profiles.id, user.id))
      .returning();
    const p = updated[0]!;
    user.fullName = p.fullName;
    user.phone = p.phone;
    user.shippingAddress = p.shippingAddress;
  }
  res.json(UpdateMeResponse.parse({ user }));
});

// Called by the storefront once per login: guest orders placed with this email become the
// account's orders (auditoría §1.4). Idempotent — a second call finds nothing left to move.
router.post("/me/guest-orders/claim", requireAuth, async (req, res) => {
  const result = await claimGuestOrders(req.user!);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(ClaimGuestOrdersResponse.parse({ claimed: result.claimed }));
});

export default router;
