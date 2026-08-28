ALTER TABLE "episode" ADD COLUMN "still_url" text;--> statement-breakpoint
ALTER TABLE "movie" ADD COLUMN "budget" integer;--> statement-breakpoint
ALTER TABLE "movie" ADD COLUMN "cast_people" jsonb;--> statement-breakpoint
ALTER TABLE "season" ADD COLUMN "poster_url" text;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "cast_people" jsonb;--> statement-breakpoint
ALTER TABLE "movie" DROP COLUMN "cast_members";--> statement-breakpoint
ALTER TABLE "series" DROP COLUMN "cast_members";