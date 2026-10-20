// Every table calls .enableRLS() with no policies, and that is deliberate: Supabase exposes
// `public` through PostgREST to anyone holding the anon key, which ships in the client bundle.
// RLS with no policy denies that path entirely. The API is unaffected because it connects as the
// table owner (`postgres`, BYPASSRLS). A new table without it fails rls.integration.test.ts.
// Enums + shared helpers
export * from "./enums";

// Catalog
export * from "./categories";
export * from "./occasions";
export * from "./products";
export * from "./product-variants";
export * from "./product-media";
export * from "./product-occasions";

// Identity
export * from "./profiles";

// Cart
export * from "./carts";
export * from "./cart-items";

// Checkout
export * from "./orders";
export * from "./order-items";
export * from "./payment-proofs";
export * from "./payment-events";
export * from "./coupons";
export * from "./coupon-redemptions";

// Customer engagement
export * from "./wishlists";
export * from "./stock-alerts";
export * from "./return-tickets";

// Legal (Libro de Reclamaciones, consent ledger)
export * from "./complaints";
export * from "./consents";

// Notifications (outbox: delivery record + retry queue)
export * from "./notification-deliveries";

// Logistics + config
export * from "./pickup-points";
export * from "./settings";
