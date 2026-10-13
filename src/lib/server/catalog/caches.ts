import { invalidateRecommendations } from '$lib/server/recommendations';
import { invalidateSearchIndex } from '$lib/server/search';

/**
 * The catalog changed (titles added/removed/renamed, metadata enriched): mark
 * every in-memory view of it stale — the search index and the recommendations
 * model rebuild lazily on their next use. Call this, not the individual
 * invalidators, after any bulk catalog write.
 */
export function invalidateCatalogCaches(): void {
	invalidateSearchIndex();
	invalidateRecommendations();
}
