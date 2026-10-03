ALTER TABLE "site_settings" ADD COLUMN "max_sessions_per_account" integer;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "max_profiles_per_account" integer DEFAULT 5;