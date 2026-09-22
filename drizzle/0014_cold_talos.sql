ALTER TABLE "user_settings" ADD COLUMN "theme" text DEFAULT 'dark' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "screensaver_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "screensaver_kind" text DEFAULT 'media' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "screensaver_seconds" integer DEFAULT 300 NOT NULL;