ALTER TABLE "playback_session" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "require_login" boolean DEFAULT true NOT NULL;