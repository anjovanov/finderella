CREATE TABLE "media_subtitle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_file_id" uuid NOT NULL,
	"source" text NOT NULL,
	"stream_index" integer,
	"rel_path" text,
	"format" text NOT NULL,
	"language" text,
	"title" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"forced" boolean DEFAULT false NOT NULL,
	"hearing_impaired" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_subtitle" ADD CONSTRAINT "media_subtitle_media_file_id_media_file_id_fk" FOREIGN KEY ("media_file_id") REFERENCES "public"."media_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_subtitle_file_idx" ON "media_subtitle" USING btree ("media_file_id");