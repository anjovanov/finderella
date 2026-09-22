CREATE TABLE "media_audio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_file_id" uuid NOT NULL,
	"stream_index" integer NOT NULL,
	"codec" text NOT NULL,
	"language" text,
	"title" text,
	"channels" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"commentary" boolean DEFAULT false NOT NULL,
	"descriptive" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "audio_language" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_audio" ADD CONSTRAINT "media_audio_media_file_id_media_file_id_fk" FOREIGN KEY ("media_file_id") REFERENCES "public"."media_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_audio_file_idx" ON "media_audio" USING btree ("media_file_id");