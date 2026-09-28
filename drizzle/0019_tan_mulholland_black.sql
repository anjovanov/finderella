CREATE TABLE "collection" (
	"tmdb_id" integer PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"poster_url" text,
	"backdrop_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "studio" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movie" ADD COLUMN "studios" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Backfill existing rows, then drop the DDL default (the schema uses a runtime $default).
ALTER TABLE "movie" ALTER COLUMN "studios" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "movie" ADD COLUMN "collection_id" integer;--> statement-breakpoint
ALTER TABLE "movie" ADD COLUMN "metadata_version" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "studios" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Backfill existing rows, then drop the DDL default (the schema uses a runtime $default).
ALTER TABLE "series" ALTER COLUMN "studios" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "metadata_version" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "movie" ADD CONSTRAINT "movie_collection_id_collection_tmdb_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("tmdb_id") ON DELETE set null ON UPDATE no action;