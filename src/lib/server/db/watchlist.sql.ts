import { sql } from 'drizzle-orm';
import { pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { profile } from './profiles.sql';
import { movie, series } from './catalog.sql';

/** A title a profile saved for later; exactly one of movieId / seriesId is set. */
export const watchlist = pgTable(
	'watchlist',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		profileId: uuid('profile_id')
			.notNull()
			.references(() => profile.id, { onDelete: 'cascade' }),
		movieId: uuid('movie_id').references(() => movie.id, { onDelete: 'cascade' }),
		seriesId: uuid('series_id').references(() => series.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('watchlist_profile_movie')
			.on(t.profileId, t.movieId)
			.where(sql`${t.movieId} is not null`),
		uniqueIndex('watchlist_profile_series')
			.on(t.profileId, t.seriesId)
			.where(sql`${t.seriesId} is not null`)
	]
);
