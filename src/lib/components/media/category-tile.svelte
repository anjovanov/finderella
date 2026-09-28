<script lang="ts">
	import { categoryHref, type CategoryTile } from '$lib/data';
	import { cn } from '$lib/utils.js';
	import LoadedImage from './loaded-image.svelte';

	let { tile, class: className }: { tile: CategoryTile; class?: string } = $props();

	const unit = $derived(tile.type === 'collections' ? 'film' : 'title');
	const countLabel = $derived(`${tile.count} ${unit}${tile.count === 1 ? '' : 's'}`);
	let loaded = $state(false);
	let logoLoaded = $state(false);
	const artReady = $derived(Boolean(tile.imageUrl) && loaded);
</script>

<!-- categoryHref() returns resolve()d paths -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	href={categoryHref(tile.type, tile.slug)}
	class={cn(
		'group relative block aspect-video overflow-hidden rounded-xl bg-muted ring-1 ring-border transition-all duration-200 outline-none hover:scale-[1.015] hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary',
		className
	)}
>
	{#if tile.imageUrl}
		<LoadedImage
			src={tile.imageUrl}
			bind:loaded
			class="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
		/>
	{/if}

	{#if tile.type === 'networks'}
		<!-- TMDB logos are mostly dark-on-transparent: flatten them to one ink
		     so they read on the muted tile in both themes. -->
		<div class="absolute inset-x-6 top-4 bottom-9 flex items-center justify-center">
			{#if tile.logoUrl}
				<LoadedImage
					src={tile.logoUrl}
					alt={tile.name}
					bind:loaded={logoLoaded}
					class="max-h-full max-w-full object-contain brightness-0 dark:invert"
				/>
			{/if}
			{#if !tile.logoUrl || !logoLoaded}
				<span class="absolute text-center text-xl font-semibold tracking-tight text-balance">
					{tile.name}
				</span>
			{/if}
		</div>
		<div
			class="absolute inset-x-0 bottom-0 flex items-baseline justify-between gap-2 px-3 pb-2 text-xs text-muted-foreground"
		>
			<span class="truncate font-medium group-hover:text-primary">{tile.name}</span>
			<span class="shrink-0">{countLabel}</span>
		</div>
	{:else}
		<div
			class="absolute inset-0"
			style:background={artReady
				? 'linear-gradient(to top, rgb(0 0 0 / 0.85), rgb(0 0 0 / 0.35) 55%, rgb(0 0 0 / 0.05))'
				: undefined}
		></div>
		<div
			class={cn(
				'absolute inset-0 flex flex-col p-4',
				artReady ? 'justify-end text-white' : 'items-center justify-center text-center'
			)}
		>
			<span
				class={cn(
					'leading-tight font-semibold tracking-tight text-balance',
					tile.type === 'genres' ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg',
					artReady && '[text-shadow:0_1px_8px_rgb(0_0_0/0.5)]'
				)}
			>
				{tile.name}
			</span>
			<span class={cn('text-xs', artReady ? 'text-white/70' : 'text-muted-foreground')}>
				{countLabel}
			</span>
		</div>
	{/if}
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
