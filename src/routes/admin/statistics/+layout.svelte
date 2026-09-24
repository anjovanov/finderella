<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		Activity01Icon,
		ChartHistogramIcon,
		Clock01Icon,
		HardDriveIcon,
		UserGroupIcon
	} from '@hugeicons/core-free-icons';
	import { cn } from '$lib/utils.js';

	let { data, children } = $props();

	const sections = [
		{
			href: resolve('/admin/statistics'),
			path: '/admin/statistics',
			label: 'Activity',
			icon: Activity01Icon,
			exact: true
		},
		{
			href: resolve('/admin/statistics/history'),
			path: '/admin/statistics/history',
			label: 'History',
			icon: Clock01Icon,
			exact: false
		},
		{
			href: resolve('/admin/statistics/graphs'),
			path: '/admin/statistics/graphs',
			label: 'Graphs',
			icon: ChartHistogramIcon,
			exact: false
		},
		{
			href: resolve('/admin/statistics/users'),
			path: '/admin/statistics/users',
			label: 'Users',
			icon: UserGroupIcon,
			exact: false
		},
		{
			href: resolve('/admin/statistics/libraries'),
			path: '/admin/statistics/libraries',
			label: 'Libraries',
			icon: HardDriveIcon,
			exact: false
		}
	];

	function isActive(section: (typeof sections)[number]): boolean {
		const path = page.url.pathname;
		return section.exact
			? path === section.path
			: path === section.path || path.startsWith(`${section.path}/`);
	}

	// Days and hours are bucketed on the admin's calendar: hand the server this
	// browser's zone and reload once when it differs from what it used.
	onMount(() => {
		const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (!zone || zone === data.tz) return;
		document.cookie = `finderella_tz=${encodeURIComponent(zone)}; path=/admin/statistics; max-age=31536000; samesite=lax`;
		void invalidateAll();
	});
</script>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-4">
		<div>
			<h1 class="text-2xl font-semibold">Statistics</h1>
			<p class="text-sm text-muted-foreground">
				What's playing now, watch history and how the libraries are used.
			</p>
		</div>
		<nav aria-label="Statistics">
			<ul class="scrollbar-none flex gap-1 overflow-x-auto">
				{#each sections as section (section.path)}
					<li class="shrink-0">
						<a
							href={section.href}
							aria-current={isActive(section) ? 'page' : undefined}
							class={cn(
								'flex items-center gap-2 rounded-4xl px-3.5 py-2 text-sm font-medium transition-colors',
								isActive(section)
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
	</div>
	{@render children()}
</div>
