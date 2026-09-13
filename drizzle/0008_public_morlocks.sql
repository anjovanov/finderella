CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"subtitle_language" text DEFAULT 'en' NOT NULL,
	"subtitle_size" text DEFAULT 'medium' NOT NULL,
	"subtitle_color" text DEFAULT '#ffffff' NOT NULL,
	"subtitle_background" boolean DEFAULT true NOT NULL,
	"subtitle_position" integer DEFAULT 2 NOT NULL,
	"subtitle_font" text DEFAULT 'sans' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;