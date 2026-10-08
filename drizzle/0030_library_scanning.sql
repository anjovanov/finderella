ALTER TABLE "media_file" ADD COLUMN "trickplay_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_file" ADD COLUMN "scan_hash" text;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "trickplay_auto" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "watch_libraries" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "scan_interval_hours" integer DEFAULT 24;