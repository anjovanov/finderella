<script lang="ts">
	import type { CastMember } from '$lib/data';
	import Carousel from './carousel.svelte';

	let { cast, title = 'Cast' }: { cast: CastMember[]; title?: string } = $props();

	function initials(name: string): string {
		return name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]!.toUpperCase())
			.join('');
	}
</script>

<section class="flex flex-col gap-1">
	<h2 class="page-gutter text-lg font-semibold tracking-tight">{title}</h2>
	<!-- arrowTop: scroller py-3 (0.75rem) + half the 7rem avatar (3.5rem) − half the button (1.125rem) -->
	<Carousel label={title} arrowTop="top-[3.125rem]">
		{#each cast as member (member.name)}
			<div class="flex w-32 shrink-0 snap-start flex-col items-center gap-2.5 text-center">
				<div
					class="flex size-28 items-center justify-center overflow-hidden rounded-full bg-muted text-xl font-semibold text-muted-foreground ring-1 ring-border"
				>
					{#if member.photoUrl}
						<img
							src={member.photoUrl}
							alt={member.name}
							loading="lazy"
							class="size-full object-cover object-top"
						/>
					{:else}
						<span aria-hidden="true">{initials(member.name)}</span>
					{/if}
				</div>
				<div class="flex w-full flex-col">
					<span class="truncate text-sm font-medium" title={member.name}>{member.name}</span>
					{#if member.character}
						<span class="truncate text-xs text-muted-foreground" title={member.character}>
							{member.character}
						</span>
					{/if}
				</div>
			</div>
		{/each}
	</Carousel>
</section>
