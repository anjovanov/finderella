import { redirect } from '@sveltejs/kit';
import { episodeWatchHref } from '$lib/data';
import { withParty } from '$lib/data/together';
import { resolve } from '$app/paths';
import { togetherRooms } from '$lib/server/together/rooms';
import type { PageServerLoad } from './$types';

/**
 * A watch party's join link: straight to whatever the party is watching now,
 * with `?party=` so the watch page joins it. Accounts only (ACCOUNT_PREFIXES),
 * and the profile picker runs first like for any page.
 */
export const load: PageServerLoad = ({ params }) => {
	const room = togetherRooms.get(params.code);
	if (!room) return { ended: true };
	const media = room.media;
	const href =
		media.kind === 'movie'
			? resolve('/movies/[id]/watch', { id: media.slug })
			: episodeWatchHref(media.slug, media.episodeSlug);
	redirect(303, withParty(href, room.code));
};
