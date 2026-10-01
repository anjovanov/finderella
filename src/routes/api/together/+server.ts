import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { flattenEpisodes } from '$lib/data';
import type { TogetherMedia } from '$lib/data/together';
import { getMovieBySlug, getSeriesBySlug } from '$lib/server/catalog';
import { episodeResumePosition, movieResumePosition } from '$lib/server/progress';
import { requireProfile } from '$lib/server/profiles';
import { togetherRooms, TooManyRoomsError } from '$lib/server/together/rooms';
import { identityFor } from '$lib/server/together/identity';

const CreateRequest = z.object({
	kind: z.enum(['movie', 'series']),
	slug: z.string().min(1),
	episodeSlug: z.string().min(1).optional(),
	positionSeconds: z.number().min(0).optional(),
	/** Already playing (a solo viewing turned into a party): the room starts running. */
	playing: z.boolean().optional()
});

/**
 * Start a watch party for a title (at `positionSeconds`, paused unless
 * `playing`). Without a position it starts where the creator's profile left
 * off, like their own Play/Resume would. Answers the
 * party code; the creator then opens the watch page with `?party=<code>`.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const profile = requireProfile(locals);
	const parsed = CreateRequest.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'expected { kind, slug, episodeSlug?, positionSeconds? }');
	const { kind, slug, episodeSlug, positionSeconds, playing } = parsed.data;

	let media: TogetherMedia;
	if (kind === 'movie') {
		if (!(await getMovieBySlug(slug))) error(404, 'Title not found');
		media = { kind, slug };
	} else {
		const show = await getSeriesBySlug(slug);
		if (!show) error(404, 'Title not found');
		const flat = flattenEpisodes(show);
		const episode = episodeSlug ? flat.find(({ episode }) => episode.id === episodeSlug) : flat[0];
		if (!episode) error(404, 'Episode not found');
		media = { kind, slug, episodeSlug: episode.episode.id };
	}

	const start =
		positionSeconds ??
		(media.kind === 'movie'
			? await movieResumePosition(profile.id, media.slug)
			: await episodeResumePosition(profile.id, media.slug, media.episodeSlug)) ??
		0;

	try {
		const room = togetherRooms.create(identityFor(locals, profile), media, start, playing ?? false);
		return json({ code: room.code });
	} catch (err) {
		if (err instanceof TooManyRoomsError) error(429, err.message);
		throw err;
	}
};
