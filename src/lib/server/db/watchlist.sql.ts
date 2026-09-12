import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import { movie, series } from './catalog.sql';

/** A title the viewer saved for later; exactly one of movieId / seriesId is set. */
export const watchlist = pgTable(
	'watchlist',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		movieId: uuid('movie_id').references(() => movie.id, { onDelete: 'cascade' }),
		seriesId: uuid('series_id').references(() => series.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('watchlist_user_movie')
			.on(t.userId, t.movieId)
			.where(sql`${t.movieId} is not null`),
		uniqueIndex('watchlist_user_series')
			.on(t.userId, t.seriesId)
			.where(sql`${t.seriesId} is not null`)
	]
);
