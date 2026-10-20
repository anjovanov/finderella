ALTER TABLE "site_settings" ADD COLUMN "default_language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_settings" ADD COLUMN "language" text;