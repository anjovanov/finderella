<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { PlayIcon, StarIcon } from '@hugeicons/core-free-icons';
	import { episodeWatchHref, type Episode, type Series } from '$lib/data';
	import EpisodeMenu from './episode-menu.svelte';
	import PosterArt from './poster-art.svelte';
	import MediaFormatTooltip from './media-format-tooltip.svelte';
	import ProgressLine from './progress-line.svelte';

	let {
		episode,
		season,
		item,
		imageUrl,
		active = false,
		href,
		menu = false,
		onNavigate
	}: {
		episode: Episode;
		/** Season number the episode belongs to (Episode itself doesn't carry it). */
		season: number;
		item: Series;
		/** Thumbnail: the episode still, else the season poster; the series art is the last resort. */
		imageUrl?: string;
		/** Marks the episode currently being watched (player episodes panel). */
		active?: boolean;
		/** Overrides the link (defaults to the episode's watch page). */
		href?: string;
		/** Show the ⋮ menu (Mark as watched) on the thumbnail — the series detail page. */
		menu?: boolean;
		/** Called when the episode link is clicked, before navigation. */
		onNavigate?: () => void;
	} = $props();

	const label = $derived(`S${season}E${episode.number}`);
</script>

<div class="group flex w-80 shrink-0 snap-start flex-col gap-2">
	<!-- The ⋮ menu can't live inside the link (interactive content inside <a> is
	     invalid), so the thumbnail is a wrapper holding the link + the menu. -->
	<div class="relative">
		<!-- episodeWatchHref() returns resolve()d paths -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={href ?? episodeWatchHref(item.id, episode.id)}
			aria-label="Play {episode.title}"
			aria-current={active ? 'true' : undefined}
			onclick={onNavigate}
			class={[
				'relative block overflow-hidden rounded-xl transition-all group-hover:ring-2 group-hover:ring-primary',
				active ? 'ring-2 ring-primary' : 'ring-1 ring-border'
			]}
		>
			<PosterArt {item} variant="backdrop" {imageUrl} />
			{#if episode.rating !== undefined}
				<span
					class="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm"
				>
					<HugeiconsIcon icon={StarIcon} class="size-3 text-yellow-400" />
					{episode.rating.toFixed(1)}
				</span>
			{/if}
			<!-- Always-visible badge; pops slightly when the card is hovered. `scale`
			     (not translate) so it can't collide with press/translate animations. -->
			<span
				class={[
					'absolute bottom-2 left-2 flex size-8 items-center justify-center rounded-full backdrop-blur-sm transition duration-200 group-hover:scale-105',
					active
						? 'bg-primary/90 text-primary-foreground ring-1 ring-primary/40'
						: 'bg-white/55 text-neutral-900 ring-1 ring-black/20 group-hover:bg-white'
				]}
			>
				{#if active}
					<!-- Equalizer: the episode is currently playing. -->
					<span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
				{:else}
					<HugeiconsIcon icon={PlayIcon} class="size-4" />
				{/if}
			</span>
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{#if menu}
			<EpisodeMenu show={item} {episode} {season} />
		{/if}
	</div>
	<ProgressLine fraction={episode.progress} />
	<div class="flex flex-col gap-1">
		<div class="flex items-baseline justify-between gap-2">
			<span class="truncate text-sm font-medium">
				<span class={['tabular-nums', active ? 'text-primary' : 'text-muted-foreground']}>
					{active ? `Now playing · ${label}` : label}
				</span>
				· {episode.title}
			</span>
			<span class="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
				<!-- Outside the <a>: interactive content can't nest in a link. -->
				{#if episode.format}
					<MediaFormatTooltip format={episode.format} />
				{/if}
				{episode.runtimeMinutes}m
			</span>
		</div>
		<p class="line-clamp-2 text-sm text-muted-foreground">{episode.synopsis}</p>
	</div>
</div>

<style>
	.eq {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 0.875rem;
	}

	.eq span {
		width: 3px;
		border-radius: 1px;
		background: currentColor;
		animation: eq-bounce 1s ease-in-out infinite;
	}

	.eq span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.eq span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes eq-bounce {
		0%,
		100% {
			height: 30%;
		}
		50% {
			height: 100%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.eq span {
			animation: none;
			height: 60%;
		}
	}
</style>
