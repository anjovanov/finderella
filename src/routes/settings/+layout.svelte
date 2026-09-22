<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { PlayCircleIcon, SubtitleIcon, UserIcon } from '@hugeicons/core-free-icons';
	import { cn } from '$lib/utils.js';

	let { children } = $props();

	// `path` is compared against page.url.pathname (resolve() yields relative
	// hrefs during SSR, so hrefs can't be used for the active check).
	const sections = [
		{
			href: resolve('/settings/profile'),
			path: '/settings/profile',
			label: 'Profile',
			icon: UserIcon
		},
		{
			href: resolve('/settings/subtitles'),
			path: '/settings/subtitles',
			label: 'Subtitles',
			icon: SubtitleIcon
		},
		{
			href: resolve('/settings/playback'),
			path: '/settings/playback',
			label: 'Playback',
			icon: PlayCircleIcon
		}
	];

	function isActive(path: string): boolean {
		return page.url.pathname === path || page.url.pathname.startsWith(`${path}/`);
	}
</script>

<div class="mx-auto flex w-full max-w-5xl page-gutter flex-col gap-8 py-10">
	<div>
		<h1 class="text-2xl font-semibold">Settings</h1>
		<p class="text-sm text-muted-foreground">Your account on this Finderella server.</p>
	</div>

	<div class="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10">
		<!-- A row of pills on small screens, a sticky column beside the content from md up. -->
		<nav aria-label="Settings" class="md:sticky md:top-24 md:self-start">
			<ul class="scrollbar-none flex gap-1 overflow-x-auto md:flex-col">
				{#each sections as section (section.path)}
					<li class="shrink-0">
						<a
							href={section.href}
							aria-current={isActive(section.path) ? 'page' : undefined}
							class={cn(
								'flex items-center gap-2.5 rounded-4xl px-3.5 py-2 text-sm font-medium transition-colors',
								isActive(section.path)
									? 'bg-accent text-foreground'
									: 'text-muted-foreground hover:text-foreground'
							)}
						>
							<HugeiconsIcon icon={section.icon} class="size-4" />
							{section.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		<div class="flex min-w-0 flex-col gap-8">
			{@render children()}
		</div>
	</div>
</div>
