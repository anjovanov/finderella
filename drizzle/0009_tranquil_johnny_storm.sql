CREATE TABLE "subtitle_download" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_file_id" uuid NOT NULL,
	"language" text NOT NULL,
	"provider" text,
	"provider_id" text,
	"release_name" text,
	"rel_path" text,
	"status" text NOT NULL,
	"error" text,
	"source" text NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subtitle_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"opensubtitles_api_key" text,
	"opensubtitles_username" text,
	"opensubtitles_password" text,
	"subdl_api_key" text,
	"languages" text DEFAULT 'en' NOT NULL,
	"auto_download" boolean DEFAULT false NOT NULL,
	"prefer_hearing_impaired" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subtitle_download" ADD CONSTRAINT "subtitle_download_media_file_id_media_file_id_fk" FOREIGN KEY ("media_file_id") REFERENCES "public"."media_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtitle_download" ADD CONSTRAINT "subtitle_download_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subtitle_download_file_lang_idx" ON "subtitle_download" USING btree ("media_file_id","language","created_at");