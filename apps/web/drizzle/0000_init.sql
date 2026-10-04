CREATE TYPE "public"."student_status" AS ENUM('pending', 'verified', 'failed', 'revoked');--> statement-breakpoint
CREATE TABLE "admin_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_clerk_id" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"tx_hash" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_reveals" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" bigint NOT NULL,
	"viewer_clerk_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"clerk_user_id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"wallet_address" text NOT NULL,
	"status" "student_status" DEFAULT 'pending' NOT NULL,
	"verify_tx_hash" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "students_email_unique" UNIQUE("email"),
	CONSTRAINT "students_wallet_address_unique" UNIQUE("wallet_address"),
	CONSTRAINT "students_wallet_lowercase" CHECK ("students"."wallet_address" = lower("students"."wallet_address"))
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"cid" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_actions_created_idx" ON "admin_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contact_reveals_item_idx" ON "contact_reveals" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "uploads_user_created_idx" ON "uploads" USING btree ("clerk_user_id","created_at");