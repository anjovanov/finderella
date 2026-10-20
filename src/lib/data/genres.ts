/**
 * A genre's name in the UI language. Genres are stored and linked as the
 * English GENRES values (slugs, filters, `byGenre`), so only display goes
 * through this; unknown values pass through unchanged.
 */
export function genreLabel(genre: string): string {
	// Not a quoted key in the map below: wuchale would extract the key as a message too.
	if (genre === /* @wc-ignore */ 'Sci-Fi') return 'Sci-Fi';
	const labels: Record<string, string> = {
		Drama: 'Drama',
		Thriller: 'Thriller',
		Comedy: 'Comedy',
		Horror: 'Horror',
		Fantasy: 'Fantasy',
		Action: 'Action',
		Mystery: 'Mystery',
		Romance: 'Romance',
		Documentary: 'Documentary'
	};
	return labels[genre] ?? genre;
}
