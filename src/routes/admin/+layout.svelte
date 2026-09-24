<script lang="ts">
	import { page } from '$app/state';
	import AdminSidebar from '$lib/components/admin-sidebar.svelte';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { cn } from '$lib/utils.js';

	let { data, children } = $props();

	const titles: Record<string, string> = {
		'/admin': 'Overview',
		'/admin/statistics': 'Statistics',
		'/admin/devices': 'Devices',
		'/admin/users': 'Users',
		'/admin/subtitles': 'Subtitles',
		'/admin/settings': 'Site settings'
	};
	// Sections with sub-pages (/admin/statistics/history …) keep their parent's title.
	const section = $derived(page.url.pathname.split('/').slice(0, 3).join('/'));
	const title = $derived(titles[page.url.pathname] ?? titles[section] ?? 'Admin');
	// Statistics tables and charts need the room; forms read better narrow.
	const wide = $derived(section === '/admin/statistics');
</script>

<Sidebar.Provider open={data.sidebarOpen}>
	<AdminSidebar />
	<Sidebar.Inset class="min-w-0">
		<header
			class="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/50 bg-background/80 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/60"
		>
			<Sidebar.Trigger />
			<Separator orientation="vertical" class="h-5!" />
			<span class="text-sm text-muted-foreground">Admin</span>
			<span class="text-sm text-muted-foreground">/</span>
			<span class="text-sm font-medium">{title}</span>
		</header>
		<div
			class={cn(
				'mx-auto flex w-full page-gutter flex-col gap-8 py-8',
				wide ? 'max-w-7xl' : 'max-w-4xl'
			)}
		>
			{@render children()}
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
