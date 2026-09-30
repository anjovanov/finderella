ALTER TYPE "public"."playback_mode" ADD VALUE 'remux';--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "remux_enabled" boolean DEFAULT true NOT NULL;