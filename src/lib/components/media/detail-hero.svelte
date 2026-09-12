<script lang="ts">
	import { invalidate, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		BookmarkAdd01Icon,
		BookmarkCheck01Icon,
		PlayIcon,
		CheckmarkCircle02Icon,
		Video01Icon
	} from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import {
		episodeLabel,
		flattenEpisodes,
		formatClock,
		formatDurationShort,
		playTarget,
		watchHref,
		type MediaItem
	} from '$lib/data';
	import { markAsWatched, setWatchlist } from '$lib/watchlist-client';
	import MetaPills from './meta-pills.svelte';
	import PosterArt from './poster-art.svelte';
	import ProgressLine from './progress-line.svelte';
	import TrailerDialog from './trailer-dialog.svelte';

	let {
		item,
		resume = null
	}: {
		item: MediaItem;
		/** Movies: the viewer's saved position while it's worth resuming (null otherwise). */
		resume?: { positionSeconds: number; durationSeconds: number } | null;
	} = $props();

	// Series resume the viewer's next-in-line episode ("Resume S2E4"); movies
	// resume at their saved position ("Resume at 1:02:03").
	const target = $derived(item.kind === 'series' ? playTarget(item) : undefined);
	const playLabel = $derived(
		item.kind === 'movie'
			? resume
				? `Resume at ${formatClock(resume.positionSeconds)}`
				: 'Play'
			: target?.resume
				? `Resume ${episodeLabel(target.season, target.episode.number)}`
				: 'Play'
	);
	const canPlay = $derived(item.kind === 'movie' || target !== undefined);
	let trailerOpen = $state(false);

	// Watchlist / mark-as-watched need an account (guests browse public hubs).
	const signedIn = $derived(page.data.user != null);
	let watchlistOverride = $state<boolean | null>(null);
	const inWatchlist = $derived(watchlistOverride ?? item.inWatchlist ?? false);
	const fullyWatched = $derived.by(() => {
		if (item.kind === 'movie') return item.progress === 1;
		const flat = flattenEpisodes(item);
		return flat.length > 0 && flat.every(({ episode }) => episode.progress === 1);
	});
	let marking = $state(false);
	// Under the poster: "1h 2m watched · 28m left", or "Watched" once finished.
	const watchLine = $derived.by(() => {
		if (item.kind !== 'movie') return null;
		if (fullyWatched) return 'Watched';
		if (!resume) return null;
		const left = Math.max(0, resume.durationSeconds - resume.positionSeconds);
		return `${formatDurationShort(resume.positionSeconds)} watched · ${formatDurationShort(left)} left`;
	});

	async function toggleWatchlist() {
		const next = !inWatchlist;
		watchlistOverride = next;
		try {
			await setWatchlist(item.kind, item.id, next);
			await invalidate('app:watchlist');
		} catch {
			watchlistOverride = null;
		}
	}

	async function markWatched() {
		marking = true;
		try {
			await markAsWatched(item.kind, item.id);
			// Re-runs the loader: progress bars fill and the Play label resets.
			await invalidateAll();
		} finally {
			marking = false;
		}
	}

	const byline = $derived(
		item.kind === 'movie' ? `Directed by ${item.director}` : `Created by ${item.creator}`
	);
	// "$200M" rather than a wall of zeros.
	const budgetLabel = $derived(
		item.kind === 'movie' && item.budget
			? new Intl.NumberFormat('en-US', {
					style: 'currency',
					currency: 'USD',
					notation: 'compact',
					maximumFractionDigits: 1
				}).format(item.budget)
			: null
	);
</script>

<section class="relative -mt-16">
	<!-- Taller box = the bottom fade starts lower and more backdrop shows. -->
	<div class="absolute inset-0 max-h-[36rem] overflow-hidden">
		<!-- The box is shorter than the full-width image: anchor the crop to the
		     top so heads/titles survive; the bottom is hidden by the fade anyway. -->
		<PosterArt
			{item}
			variant="backdrop"
			class="aspect-auto size-full opacity-60 [&>img]:object-top"
		/>
		<div class="absolute inset-0 hero-fade-b"></div>
	</div>
	<div class="relative flex page-gutter flex-col gap-6 pt-40 pb-8 sm:flex-row sm:items-end">
		<div class="flex w-56 shrink-0 flex-col gap-2 sm:w-72 lg:w-80">
			<div class="overflow-hidden rounded-xl shadow-2xl ring-1 ring-border">
				<PosterArt {item} showTitle />
			</div>
			{#if watchLine}
				<ProgressLine fraction={item.progress} />
				<p class="text-xs text-muted-foreground">{watchLine}</p>
			{/if}
		</div>
		<div class="flex max-w-2xl flex-col gap-3">
			<h1 class="text-3xl font-bold tracking-tight text-balance sm:text-5xl">{item.title}</h1>
			{#if item.tagline}
				<p class="text-lg text-muted-foreground italic">{item.tagline}</p>
			{/if}
			<MetaPills {item} size="md" />
			<p class="text-lg text-muted-foreground">{item.synopsis}</p>
			<p class="text-sm text-muted-foreground">
				{byline}
				{#if budgetLabel}
					<span aria-hidden="true">·</span> Budget {budgetLabel}
				{/if}
			</p>
			<div class="mt-1 flex flex-col gap-3">
				<!-- The primary action: oversized on purpose so it reads first. -->
				<div>
					<Button
						href={watchHref(item)}
						size="lg"
						disabled={!canPlay}
						class="h-11 min-w-72 px-8 text-base font-semibold"
					>
						<HugeiconsIcon icon={PlayIcon} data-icon="inline-start" class="size-6" />
						{playLabel}
					</Button>
				</div>
				<div class="flex flex-wrap gap-2">
					{#if signedIn}
						<Button
							variant="secondary"
							size="lg"
							class="text-muted-foreground hover:text-foreground"
							aria-pressed={inWatchlist}
							onclick={toggleWatchlist}
						>
							<!-- HugeiconsIcon draws its icon once on mount, hence the {#if}. -->
							{#if inWatchlist}
								<HugeiconsIcon
									icon={BookmarkCheck01Icon}
									data-icon="inline-start"
									class="size-5 text-foreground"
								/>
								In watchlist
							{:else}
								<HugeiconsIcon
									icon={BookmarkAdd01Icon}
									data-icon="inline-start"
									class="size-5 text-foreground"
								/>
								Watchlist
							{/if}
						</Button>
						<Button
							variant="secondary"
							size="lg"
							class="text-muted-foreground hover:text-foreground"
							disabled={fullyWatched || marking || !canPlay}
							onclick={markWatched}
						>
							<HugeiconsIcon
								icon={CheckmarkCircle02Icon}
								data-icon="inline-start"
								class="size-5 text-foreground"
							/>
							{fullyWatched ? 'Watched' : 'Mark as watched'}
						</Button>
					{/if}
					{#if item.trailerKey}
						<Button
							variant="secondary"
							size="lg"
							class="text-muted-foreground hover:text-foreground"
							onclick={() => (trailerOpen = true)}
						>
							<HugeiconsIcon
								icon={Video01Icon}
								data-icon="inline-start"
								class="size-5 text-foreground"
							/>
							Watch trailer
						</Button>
					{/if}
				</div>
			</div>
		</div>
	</div>
</section>

{#if item.trailerKey}
	<TrailerDialog bind:open={trailerOpen} trailerKey={item.trailerKey} title={item.title} />
{/if}
