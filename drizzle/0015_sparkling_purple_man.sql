ALTER TABLE "user_settings" ADD COLUMN "autoplay_next" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "still_watching_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "still_watching_episodes" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "still_watching_minutes" integer DEFAULT 120 NOT NULL;