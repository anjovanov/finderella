ALTER TABLE "episode" ADD COLUMN "metadata_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "movie" ADD COLUMN "tmdb_id" integer;--> statement-breakpoint
ALTER TABLE "movie" ADD COLUMN "metadata_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "tmdb_id" integer;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "metadata_updated_at" timestamp with time zone;