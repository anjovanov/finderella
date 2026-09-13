<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Search01Icon } from '@hugeicons/core-free-icons';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import LoadedImage from '$lib/components/media/loaded-image.svelte';
	import { mediaHref, searchHref, type SearchResult } from '$lib/data';
	import { searchCatalog } from '$lib/search-client';
	import { cn } from '$lib/utils.js';

	/**
	 * The navbar search: an input with an instant, keyboard-navigable results
	 * list fed by GET /api/search (typo-tolerant, see src/lib/server/search).
	 * Enter with no row highlighted opens the full /search page.
	 */
	let {
		layout = 'dropdown',
		onNavigate
	}: {
		/** `dropdown` floats the results under the input; `inline` renders them in flow (mobile sheet). */
		layout?: 'dropdown' | 'inline';
		/** Called right before navigating from a result (the mobile sheet closes itself). */
		onNavigate?: () => void;
	} = $props();

	const DEBOUNCE_MS = 150;
	const LIMIT = 8;

	// Syncs with the URL's ?q= on navigation; typing overrides until the next navigation.
	let query = $derived(page.url.searchParams.get('q') ?? '');
	let results = $state.raw<SearchResult[]>([]);
	let open = $state(false);
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);
	/** -1 = nothing highlighted; results.length = the "See all results" row. */
	let active = $state(-1);

	const uid = $props.id();
	const listId = `search-${uid}-list`;
	const trimmed = $derived(query.trim());
	const activeId = $derived(active >= 0 ? `${listId}-${active}` : undefined);
	const lastRow = $derived(results.length);

	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | null = null;
	let seq = 0;

	function cancelPending() {
		clearTimeout(timer);
		controller?.abort();
		controller = null;
	}

	async function run(q: string) {
		controller?.abort();
		controller = new AbortController();
		const mySeq = ++seq;
		try {
			const hits = await searchCatalog(q, LIMIT, controller.signal);
			if (mySeq !== seq) return;
			results = hits;
			errorMessage = null;
		} catch (err) {
			if (mySeq !== seq || (err instanceof DOMException && err.name === 'AbortError')) return;
			results = [];
			errorMessage = err instanceof Error ? err.message : 'Search failed';
		} finally {
			if (mySeq === seq) loading = false;
		}
	}

	function oninput() {
		active = -1;
		clearTimeout(timer);
		if (!trimmed) {
			cancelPending();
			seq++;
			results = [];
			loading = false;
			errorMessage = null;
			open = false;
			return;
		}
		loading = true;
		open = true;
		timer = setTimeout(() => run(trimmed), DEBOUNCE_MS);
	}

	function go(href: string) {
		cancelPending();
		open = false;
		active = -1;
		onNavigate?.();
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- built from resolve()d paths
		void goto(href);
	}

	function submit() {
		if (trimmed) go(searchHref(trimmed));
	}

	function onkeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowDown':
			case 'ArrowUp': {
				if (!trimmed) return;
				event.preventDefault();
				open = true;
				const delta = event.key === 'ArrowDown' ? 1 : -1;
				const count = lastRow + 2; // rows + "See all" + none
				active = ((active + 1 + delta + count) % count) - 1;
				return;
			}
			case 'Enter':
				if (!open || active < 0) return; // let the form submit
				event.preventDefault();
				if (active < lastRow) go(mediaHref(results[active]));
				else submit();
				return;
			case 'Escape':
				// Chrome clears a type=search input on Escape; keep the text.
				event.preventDefault();
				open = false;
				active = -1;
				return;
			case 'Tab':
				open = false;
				return;
		}
	}

	function onsubmit(event: SubmitEvent) {
		event.preventDefault();
		submit();
	}

	function onfocus() {
		if (trimmed && (results.length > 0 || loading || errorMessage)) open = true;
	}

	function onfocusout(event: FocusEvent) {
		const next = event.relatedTarget;
		if (
			next instanceof Node &&
			event.currentTarget instanceof Node &&
			event.currentTarget.contains(next)
		)
			return;
		open = false;
		active = -1;
	}

	/** Modifier/middle clicks keep native link behaviour (new tab). */
	function plainClick(event: MouseEvent): boolean {
		return (
			event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
		);
	}

	afterNavigate(() => {
		open = false;
		active = -1;
	});

	const rowClass =
		'flex items-center gap-4 px-4 py-2.5 text-base outline-none transition-colors hover:bg-accent aria-selected:bg-accent';
</script>

<div class={cn('relative', layout === 'dropdown' && 'w-full')} {onfocusout}>
	<form role="search" class="relative" {onsubmit}>
		<HugeiconsIcon
			icon={Search01Icon}
			class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
		/>
		<Input
			type="search"
			placeholder="Search…"
			bind:value={query}
			class="pl-9"
			role="combobox"
			aria-expanded={open}
			aria-controls={listId}
			aria-activedescendant={activeId}
			aria-autocomplete="list"
			aria-label="Search movies and series"
			autocomplete="off"
			spellcheck={false}
			enterkeyhint="search"
			{oninput}
			{onkeydown}
			{onfocus}
		/>
	</form>
	{#if open}
		<!-- mousedown is swallowed so the input keeps focus while a row is clicked
		     (Safari doesn't focus anchors, so focusout would close the list first).
		     Rows are real links (mediaHref()/searchHref() return resolve()d paths)
		     so they open in new tabs; a plain click goes through go() instead. -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<div
			id={listId}
			role="listbox"
			aria-label="Search results"
			aria-busy={loading}
			tabindex="-1"
			onmousedown={(e) => e.preventDefault()}
			class={cn(
				'overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground',
				layout === 'dropdown'
					? 'absolute top-full left-0 z-50 mt-2 w-[min(34rem,calc(100vw-2rem))] shadow-lg'
					: 'mt-2'
			)}
		>
			{#if loading && results.length === 0 && !errorMessage}
				{#each [0, 1, 2] as i (i)}
					<div class="flex items-center gap-4 px-4 py-2.5">
						<Skeleton class="aspect-[2/3] w-12 shrink-0 rounded-md" />
						<div class="flex flex-1 flex-col gap-1.5">
							<Skeleton class="h-4 w-2/3" />
							<Skeleton class="h-3.5 w-1/4" />
						</div>
					</div>
				{/each}
			{:else if errorMessage}
				<p class="px-4 py-4 text-sm text-destructive">{errorMessage}</p>
			{:else if results.length === 0}
				<p class="px-4 py-8 text-center text-base text-muted-foreground">
					No titles match “{trimmed}”.
				</p>
			{:else}
				<div class={cn('flex flex-col', loading && 'opacity-70')}>
					{#each results as result, i (`${result.kind}:${result.id}`)}
						<a
							role="option"
							id={`${listId}-${i}`}
							aria-selected={active === i}
							tabindex="-1"
							href={mediaHref(result)}
							onclick={(e) => {
								if (plainClick(e)) {
									e.preventDefault();
									go(mediaHref(result));
								}
							}}
							onpointermove={() => (active = i)}
							class={rowClass}
						>
							<div class="aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-md bg-muted">
								{#if result.posterUrl}
									<LoadedImage src={result.posterUrl} class="size-full object-cover" />
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<div class="truncate font-medium">{result.title}</div>
								<div class="text-sm text-muted-foreground">{result.year}</div>
							</div>
							<Badge variant="outline">{result.kind === 'movie' ? 'Movie' : 'Series'}</Badge>
						</a>
					{/each}
				</div>
			{/if}
			{#if trimmed}
				<a
					role="option"
					id={`${listId}-${lastRow}`}
					aria-selected={active === lastRow}
					tabindex="-1"
					href={searchHref(trimmed)}
					onclick={(e) => {
						if (plainClick(e)) {
							e.preventDefault();
							submit();
						}
					}}
					onpointermove={() => (active = lastRow)}
					class={cn(rowClass, 'border-t border-border/50 font-medium text-primary')}
				>
					See all results for “{trimmed}”
				</a>
			{/if}
		</div>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{/if}
</div>
