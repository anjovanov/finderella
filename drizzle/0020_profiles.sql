CREATE TABLE "profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"avatar_color" text DEFAULT 'teal' NOT NULL,
	"avatar_icon" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_settings" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"subtitle_language" text DEFAULT 'en' NOT NULL,
	"subtitle_size" text DEFAULT 'medium' NOT NULL,
	"subtitle_color" text DEFAULT '#ffffff' NOT NULL,
	"subtitle_background" boolean DEFAULT true NOT NULL,
	"subtitle_position" integer DEFAULT 2 NOT NULL,
	"subtitle_font" text DEFAULT 'sans' NOT NULL,
	"audio_language" text DEFAULT 'default' NOT NULL,
	"audio_channels" text DEFAULT 'auto' NOT NULL,
	"autoplay_next" boolean DEFAULT true NOT NULL,
	"still_watching_enabled" boolean DEFAULT false NOT NULL,
	"still_watching_episodes" integer DEFAULT 3 NOT NULL,
	"still_watching_minutes" integer DEFAULT 120 NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"screensaver_enabled" boolean DEFAULT false NOT NULL,
	"screensaver_kind" text DEFAULT 'media' NOT NULL,
	"screensaver_seconds" integer DEFAULT 300 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_profile_id" text;--> statement-breakpoint
ALTER TABLE "play_history" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "play_history" ADD COLUMN "profile_name" text;--> statement-breakpoint
ALTER TABLE "playback_session" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "watchlist" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_settings" ADD CONSTRAINT "profile_settings_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_user_idx" ON "profile" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_user_primary" ON "profile" USING btree ("user_id") WHERE "profile"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "profile_user_name" ON "profile" USING btree ("user_id","name");--> statement-breakpoint
ALTER TABLE "play_history" ADD CONSTRAINT "play_history_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_session" ADD CONSTRAINT "playback_session_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-written backfill: every existing account gets a primary profile that
-- inherits its settings, progress, watchlist and history. Idempotent.
INSERT INTO "profile" ("user_id", "name", "avatar_color", "is_primary", "created_at")
SELECT u."id", coalesce(nullif(left(btrim(u."name"), 30), ''), 'Profile'), 'teal', true, u."created_at"
FROM "user" u
WHERE NOT EXISTS (SELECT 1 FROM "profile" p WHERE p."user_id" = u."id");--> statement-breakpoint
INSERT INTO "profile_settings" (
	"profile_id", "subtitle_language", "subtitle_size", "subtitle_color", "subtitle_background",
	"subtitle_position", "subtitle_font", "audio_language", "audio_channels", "autoplay_next",
	"still_watching_enabled", "still_watching_episodes", "still_watching_minutes", "theme",
	"screensaver_enabled", "screensaver_kind", "screensaver_seconds", "updated_at"
)
SELECT p."id", s."subtitle_language", s."subtitle_size", s."subtitle_color", s."subtitle_background",
	s."subtitle_position", s."subtitle_font", s."audio_language", s."audio_channels", s."autoplay_next",
	s."still_watching_enabled", s."still_watching_episodes", s."still_watching_minutes", s."theme",
	s."screensaver_enabled", s."screensaver_kind", s."screensaver_seconds", s."updated_at"
FROM "user_settings" s
JOIN "profile" p ON p."user_id" = s."user_id" AND p."is_primary"
ON CONFLICT ("profile_id") DO NOTHING;--> statement-breakpoint
UPDATE "watch_progress" w SET "profile_id" = p."id"
FROM "profile" p WHERE p."user_id" = w."user_id" AND p."is_primary" AND w."profile_id" IS NULL;--> statement-breakpoint
UPDATE "watchlist" w SET "profile_id" = p."id"
FROM "profile" p WHERE p."user_id" = w."user_id" AND p."is_primary" AND w."profile_id" IS NULL;--> statement-breakpoint
UPDATE "playback_session" s SET "profile_id" = p."id"
FROM "profile" p WHERE p."user_id" = s."user_id" AND p."is_primary" AND s."profile_id" IS NULL;--> statement-breakpoint
UPDATE "play_history" h SET "profile_id" = p."id", "profile_name" = p."name"
FROM "profile" p WHERE p."user_id" = h."user_id" AND p."is_primary" AND h."profile_id" IS NULL;
