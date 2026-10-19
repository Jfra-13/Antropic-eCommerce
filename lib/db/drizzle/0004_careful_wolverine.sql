ALTER TABLE "orders" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "contact_phone" text;--> statement-breakpoint
-- Hand-written backfill (not from the schema diff). Guest orders placed before this column
-- existed carry their contact only on the guest profile; claiming one into an account would
-- otherwise drop it from every staff screen. Account orders are left alone: their contact is
-- the account's own profile.
UPDATE "orders" SET
  "contact_name" = nullif(trim("profiles"."full_name"), ''),
  "contact_phone" = nullif(trim("profiles"."phone"), '')
FROM "profiles"
WHERE "profiles"."id" = "orders"."user_id"
  AND "profiles"."is_guest" = true
  AND "orders"."contact_name" IS NULL;
