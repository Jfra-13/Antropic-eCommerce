ALTER TABLE "profiles" ADD COLUMN "is_guest" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "guest_access_token" text;--> statement-breakpoint
CREATE INDEX "profiles_guest_email_idx" ON "profiles" USING btree (lower("email")) WHERE "profiles"."is_guest";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_guest_access_token_unique" UNIQUE("guest_access_token");