CREATE TABLE "media_marker" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_file_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"confidence" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_marker_media_file_id_kind_source_unique" UNIQUE("media_file_id","kind","source")
);
--> statement-breakpoint
ALTER TABLE "media_file" ADD COLUMN "chapters" jsonb;--> statement-breakpoint
ALTER TABLE "media_file" ADD COLUMN "markers_version" integer;--> statement-breakpoint
ALTER TABLE "media_file" ADD COLUMN "markers_analyzed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_file" ADD COLUMN "markers_error" text;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "markers_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_settings" ADD COLUMN "skip_intro" text DEFAULT 'show' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_settings" ADD COLUMN "skip_credits" text DEFAULT 'show' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_marker" ADD CONSTRAINT "media_marker_media_file_id_media_file_id_fk" FOREIGN KEY ("media_file_id") REFERENCES "public"."media_file"("id") ON DELETE cascade ON UPDATE no action;