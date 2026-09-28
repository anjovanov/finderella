ALTER TABLE "user_settings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "user_settings" CASCADE;--> statement-breakpoint
ALTER TABLE "watch_progress" DROP CONSTRAINT "watch_progress_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "watchlist" DROP CONSTRAINT "watchlist_user_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "watch_progress_user_movie";--> statement-breakpoint
DROP INDEX "watch_progress_user_episode";--> statement-breakpoint
DROP INDEX "watchlist_user_movie";--> statement-breakpoint
DROP INDEX "watchlist_user_series";--> statement-breakpoint
ALTER TABLE "watch_progress" ALTER COLUMN "profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "watchlist" ALTER COLUMN "profile_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "watch_progress_profile_movie" ON "watch_progress" USING btree ("profile_id","movie_id") WHERE "watch_progress"."movie_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "watch_progress_profile_episode" ON "watch_progress" USING btree ("profile_id","episode_id") WHERE "watch_progress"."episode_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_profile_movie" ON "watchlist" USING btree ("profile_id","movie_id") WHERE "watchlist"."movie_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_profile_series" ON "watchlist" USING btree ("profile_id","series_id") WHERE "watchlist"."series_id" is not null;--> statement-breakpoint
ALTER TABLE "watch_progress" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "watchlist" DROP COLUMN "user_id";