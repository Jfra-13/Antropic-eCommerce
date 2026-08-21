CREATE TYPE "public"."payment_method" AS ENUM('manual_yape');--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'autorizado';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'expirado';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'reembolsado';--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" "payment_method" NOT NULL,
	"event_id" text,
	"type" text NOT NULL,
	"from_status" "payment_status",
	"to_status" "payment_status" NOT NULL,
	"actor_id" uuid,
	"amount" numeric(10, 2),
	"currency" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_method" "payment_method" DEFAULT 'manual_yape' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_events_order_idx" ON "payment_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_idx" ON "payment_events" USING btree ("provider","event_id") WHERE "payment_events"."event_id" is not null;