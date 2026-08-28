import { relations } from 'drizzle-orm';
import type { CastMember } from '$lib/data/types';
import {
	integer,
	jsonb,
	pgTable,
	real,
	smallint,
	text,
	timestamp,
	unique,
	uuid
} from 'drizzle-orm/pg-core';

/**
 * Catalog tables. Shapes mirror the frontend contract in src/lib/data/types.ts:
 * `slug` is the public ID used in URLs; `hue`/`hue2` feed the generated
 * gradient poster art; genres is a text[] matching the fixed GENRES enum.
 * `tmdb_id` / `metadata_updated_at` track TMDB enrichment (see
 * src/lib/server/metadata): stamped even when unmatched so scans don't retry.
 */

export const movie = pgTable('movie', {
	id: uuid('id').primaryKey().defaultRandom(),
	slug: text('slug').notNull().unique(),
	title: text('title').notNull(),
	tagline: text('tagline'),
	synopsis: text('synopsis').notNull().default(''),
	year: integer('year').notNull(),
	runtimeMinutes: integer('runtime_minutes').notNull().default(0),
	rating: real('rating').notNull().default(0),
	maturity: text('maturity').notNull().default('PG-13'),
	director: text('director').notNull().default(''),
	/** USD, from TMDB; null when unknown. */
	budget: integer('budget'),
	// Nullable + runtime default (read as []) so drizzle-kit never has to
	// reconcile a JSON DDL default.
	castPeople: jsonb('cast_people')
		.$type<CastMember[]>()
		.$default(() => []),
	// Runtime $default, not a DB default: drizzle-kit introspects empty-array
	// DDL defaults as '{""}' and re-proposes the same ALTERs on every push.
	genres: text('genres')
		.array()
		.notNull()
		.$default(() => []),
	hue: smallint('hue').notNull(),
	hue2: smallint('hue2').notNull(),
	posterUrl: text('poster_url'),
	backdropUrl: text('backdrop_url'),
	tmdbId: integer('tmdb_id'),
	metadataUpdatedAt: timestamp('metadata_updated_at', { withTimezone: true }),
	addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow()
});

export const series = pgTable('series', {
	id: uuid('id').primaryKey().defaultRandom(),
	slug: text('slug').notNull().unique(),
	title: text('title').notNull(),
	tagline: text('tagline'),
	synopsis: text('synopsis').notNull().default(''),
	year: integer('year').notNull(),
	endYear: integer('end_year'),
	creator: text('creator').notNull().default(''),
	rating: real('rating').notNull().default(0),
	maturity: text('maturity').notNull().default('TV-14'),
	castPeople: jsonb('cast_people')
		.$type<CastMember[]>()
		.$default(() => []),
	// Runtime $default, not a DB default: drizzle-kit introspects empty-array
	// DDL defaults as '{""}' and re-proposes the same ALTERs on every push.
	genres: text('genres')
		.array()
		.notNull()
		.$default(() => []),
	hue: smallint('hue').notNull(),
	hue2: smallint('hue2').notNull(),
	posterUrl: text('poster_url'),
	backdropUrl: text('backdrop_url'),
	tmdbId: integer('tmdb_id'),
	metadataUpdatedAt: timestamp('metadata_updated_at', { withTimezone: true }),
	addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow()
});

export const season = pgTable(
	'season',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		seriesId: uuid('series_id')
			.notNull()
			.references(() => series.id, { onDelete: 'cascade' }),
		number: integer('number').notNull(),
		year: integer('year').notNull(),
		posterUrl: text('poster_url')
	},
	(t) => [unique().on(t.seriesId, t.number)]
);

export const episode = pgTable(
	'episode',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		seasonId: uuid('season_id')
			.notNull()
			.references(() => season.id, { onDelete: 'cascade' }),
		// Denormalized: the watch route resolves by (series slug, episode slug).
		seriesId: uuid('series_id')
			.notNull()
			.references(() => series.id, { onDelete: 'cascade' }),
		slug: text('slug').notNull(),
		number: integer('number').notNull(),
		title: text('title').notNull(),
		synopsis: text('synopsis').notNull().default(''),
		runtimeMinutes: integer('runtime_minutes').notNull().default(0),
		stillUrl: text('still_url'),
		// Set once a TMDB season fetch has processed this episode (matched or not).
		metadataUpdatedAt: timestamp('metadata_updated_at', { withTimezone: true })
	},
	(t) => [unique().on(t.seriesId, t.slug)]
);

export const movieRelations = relations(movie, () => ({}));

export const seriesRelations = relations(series, ({ many }) => ({
	seasons: many(season),
	episodes: many(episode)
}));

export const seasonRelations = relations(season, ({ one, many }) => ({
	series: one(series, { fields: [season.seriesId], references: [series.id] }),
	episodes: many(episode)
}));

export const episodeRelations = relations(episode, ({ one }) => ({
	season: one(season, { fields: [episode.seasonId], references: [season.id] }),
	series: one(series, { fields: [episode.seriesId], references: [series.id] })
}));
