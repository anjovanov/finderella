CREATE TYPE "public"."play_kind" AS ENUM('movie', 'episode');--> statement-breakpoint
CREATE TABLE "play_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"kind" "play_kind" NOT NULL,
	"movie_id" uuid,
	"episode_id" uuid,
	"series_id" uuid,
	"media_file_id" uuid,
	"library_id" uuid,
	"gateway_id" uuid,
	"title" text NOT NULL,
	"series_title" text,
	"season_number" integer,
	"episode_number" integer,
	"year" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stopped_at" timestamp with time zone,
	"played_seconds" real DEFAULT 0 NOT NULL,
	"paused_seconds" real DEFAULT 0 NOT NULL,
	"start_position" real DEFAULT 0 NOT NULL,
	"position_seconds" real DEFAULT 0 NOT NULL,
	"duration_seconds" real,
	"mode" "playback_mode" NOT NULL,
	"transcoded" boolean DEFAULT false NOT NULL,
	"quality" text,
	"source_width" integer,
	"source_height" integer,
	"video_codec" text,
	"audio_codec" text,
	"bytes_sent" bigint DEFAULT 0 NOT NULL,
	"user_agent" text,
	"browser" text,
	"browser_version" text,
	"os" text,
	"device_type" text DEFAULT 'unknown' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_activity" (
	"user_id" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_user_agent" text
);
--> statement-breakpoint
ALTER TABLE "playback_session" ADD COLUMN "stop_reason" text;--> statement-breakpoint
ALTER TABLE "playback_session" ADD COLUMN "history_id" uuid;--> statement-breakpoint
ALTER TABLE "play_history" ADD CONSTRAINT "play_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_history" ADD CONSTRAINT "play_history_movie_id_movie_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movie"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_history" ADD CONSTRAINT "play_history_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_history" ADD CONSTRAINT "play_history_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_history" ADD CONSTRAINT "play_history_media_file_id_media_file_id_fk" FOREIGN KEY ("media_file_id") REFERENCES "public"."media_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_history" ADD CONSTRAINT "play_history_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_history" ADD CONSTRAINT "play_history_gateway_id_gateway_id_fk" FOREIGN KEY ("gateway_id") REFERENCES "public"."gateway"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "play_history_started_idx" ON "play_history" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "play_history_user_started_idx" ON "play_history" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "play_history_movie_idx" ON "play_history" USING btree ("movie_id");--> statement-breakpoint
CREATE INDEX "play_history_series_idx" ON "play_history" USING btree ("series_id");--> statement-breakpoint
ALTER TABLE "playback_session" ADD CONSTRAINT "playback_session_history_id_play_history_id_fk" FOREIGN KEY ("history_id") REFERENCES "public"."play_history"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "playback_session_status_idx" ON "playback_session" USING btree ("status");