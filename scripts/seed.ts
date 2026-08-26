/**
 * Dev seed: inserts the mock catalog (src/lib/data) into the database so the
 * UI is fully browsable without any paired gateway. Idempotent — existing slugs
 * are skipped. Media files are NOT created (playback uses the demo fallback).
 *
 * Run: npm run seed
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { movies } from '../src/lib/data/movies';
import { series as mockSeries } from '../src/lib/data/series';
import * as schema from '../src/lib/server/db/schema';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

let inserted = 0;
let skipped = 0;

for (const m of movies) {
	const exists = await db.query.movie.findFirst({ where: eq(schema.movie.slug, m.id) });
	if (exists) {
		skipped++;
		continue;
	}
	await db.insert(schema.movie).values({
		slug: m.id,
		title: m.title,
		tagline: m.tagline,
		synopsis: m.synopsis,
		year: m.year,
		runtimeMinutes: m.runtimeMinutes,
		rating: m.rating,
		maturity: m.maturity,
		director: m.director,
		castMembers: m.cast,
		genres: m.genres,
		hue: m.theme.hue,
		hue2: m.theme.hue2,
		posterUrl: m.posterUrl,
		backdropUrl: m.backdropUrl
	});
	inserted++;
}

for (const s of mockSeries) {
	const exists = await db.query.series.findFirst({ where: eq(schema.series.slug, s.id) });
	if (exists) {
		skipped++;
		continue;
	}
	const [seriesRow] = await db
		.insert(schema.series)
		.values({
			slug: s.id,
			title: s.title,
			tagline: s.tagline,
			synopsis: s.synopsis,
			year: s.year,
			endYear: s.endYear,
			creator: s.creator,
			rating: s.rating,
			maturity: s.maturity,
			castMembers: s.cast,
			genres: s.genres,
			hue: s.theme.hue,
			hue2: s.theme.hue2,
			posterUrl: s.posterUrl,
			backdropUrl: s.backdropUrl
		})
		.returning({ id: schema.series.id });
	for (const season of s.seasons) {
		const [seasonRow] = await db
			.insert(schema.season)
			.values({ seriesId: seriesRow.id, number: season.number, year: season.year })
			.returning({ id: schema.season.id });
		if (season.episodes.length > 0) {
			await db.insert(schema.episode).values(
				season.episodes.map((e) => ({
					seasonId: seasonRow.id,
					seriesId: seriesRow.id,
					slug: e.id,
					number: e.number,
					title: e.title,
					synopsis: e.synopsis,
					runtimeMinutes: e.runtimeMinutes
				}))
			);
		}
	}
	inserted++;
}

console.log(`seed done: ${inserted} titles inserted, ${skipped} already present`);
await client.end();
