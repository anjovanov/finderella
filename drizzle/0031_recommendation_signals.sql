ALTER TABLE "movie" ADD COLUMN "keywords" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Backfill existing rows, then drop the DDL default (the schema uses a runtime $default).
ALTER TABLE "movie" ALTER COLUMN "keywords" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "movie" ADD COLUMN "tmdb_genre_ids" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Backfill existing rows, then drop the DDL default (the schema uses a runtime $default).
ALTER TABLE "movie" ALTER COLUMN "tmdb_genre_ids" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "movie" ADD COLUMN "tmdb_recommendations" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Backfill existing rows, then drop the DDL default (the schema uses a runtime $default).
ALTER TABLE "movie" ALTER COLUMN "tmdb_recommendations" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "movie" ADD COLUMN "popularity" real;--> statement-breakpoint
ALTER TABLE "movie" ADD COLUMN "vote_count" integer;--> statement-breakpoint
ALTER TABLE "movie" ADD COLUMN "original_language" text;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "keywords" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Backfill existing rows, then drop the DDL default (the schema uses a runtime $default).
ALTER TABLE "series" ALTER COLUMN "keywords" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "tmdb_genre_ids" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Backfill existing rows, then drop the DDL default (the schema uses a runtime $default).
ALTER TABLE "series" ALTER COLUMN "tmdb_genre_ids" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "tmdb_recommendations" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Backfill existing rows, then drop the DDL default (the schema uses a runtime $default).
ALTER TABLE "series" ALTER COLUMN "tmdb_recommendations" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "popularity" real;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "vote_count" integer;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "original_language" text;
