<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		ChartHistogramIcon,
		ComputerIcon,
		PaintBoardIcon,
		PlayCircleIcon,
		SubtitleIcon,
		UserIcon
	} from '@hugeicons/core-free-icons';
	import { cn } from '$lib/utils.js';

	let { children } = $props();

	// `path` is compared against page.url.pathname (resolve() yields relative
	// hrefs during SSR, so hrefs can't be used for the active check).
	// Account-level sections first; the rest belong to the active profile.
	const accountSections = [
		{
			href: resolve('/settings/account'),
			path: '/settings/account',
			label: 'Account',
			icon: UserIcon
		},
		{
			href: resolve('/settings/devices'),
			path: '/settings/devices',
			label: 'Devices',
			icon: ComputerIcon
		}
	];
	const profileSections = [
		{
			href: resolve('/settings/preferences'),
			path: '/settings/preferences',
			label: 'Preferences',
			icon: PaintBoardIcon
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
		},
		{
			href: resolve('/settings/statistics'),
			path: '/settings/statistics',
			label: 'Statistics',
			icon: ChartHistogramIcon
		}
	];

	// Before a profile is picked only the account sections are reachable.
	const profile = $derived(page.data.profile);
	// `name` is shown as written after the (upper-cased) label: "PROFILE: Mia".
	const groups = $derived([
		{ id: 'account', label: 'Account', name: null, sections: accountSections },
		...(profile
			? [{ id: 'profile', label: 'Profile:', name: profile.name, sections: profileSections }]
			: [])
	]);

	function isActive(path: string): boolean {
		return page.url.pathname === path || page.url.pathname.startsWith(`${path}/`);
	}
</script>

<div class="mx-auto flex w-full max-w-5xl page-gutter flex-col gap-8 py-10">
	<div>
		<h1 class="text-2xl font-semibold">Settings</h1>
		<p class="text-sm text-muted-foreground">
			Your account on this Finderella server, and the settings of the profile you are watching as.
		</p>
	</div>

	<div class="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10">
		<!-- A row of pills on small screens, a sticky column beside the content from md up. -->
		<nav aria-label="Settings" class="md:sticky md:top-24 md:self-start">
			<div class="scrollbar-none flex gap-1 overflow-x-auto md:flex-col md:gap-5">
				{#each groups as group (group.id)}
					<div class="flex shrink-0 gap-1 md:flex-col">
						<p
							class="hidden truncate px-3.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase md:block"
						>
							{group.label}
							{#if group.name}<span class="normal-case">{group.name}</span>{/if}
						</p>
						<ul class="flex gap-1 md:flex-col">
							{#each group.sections as section (section.path)}
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
					</div>
				{/each}
			</div>
		</nav>

		<div class="flex min-w-0 flex-col gap-8">
			{@render children()}
		</div>
	</div>
</div>
