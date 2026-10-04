ALTER TABLE "site_settings" ADD COLUMN "app_name" text DEFAULT 'Finderella' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "accent" text DEFAULT 'teal' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "body_font" text DEFAULT 'figtree' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "heading_font" text DEFAULT 'figtree' NOT NULL;