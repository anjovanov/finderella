import { page } from '$app/state';
import { DEFAULT_BRANDING, type Branding } from '$lib/data/branding';

/**
 * The hub's branding as the root layout loaded it. Reactive like `page`
 * itself: call it in markup or a `$derived` and it follows an admin's save.
 * User-visible copy names the app through this, never a literal "Finderella".
 */
export function branding(): Branding {
	return page.data.branding ?? DEFAULT_BRANDING;
}
