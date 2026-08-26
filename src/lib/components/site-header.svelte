<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Menu01Icon, Search01Icon, Settings01Icon } from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Sheet from '$lib/components/ui/sheet';
	import { cn } from '$lib/utils.js';

	const links = [
		{ href: resolve('/'), label: 'Home' },
		{ href: resolve('/movies'), label: 'Movies' },
		{ href: resolve('/series'), label: 'Series' },
		{ href: resolve('/categories'), label: 'Categories' }
	];
	const libraryPaths = [resolve('/movies'), resolve('/series')];

	// Syncs with the URL's ?q= on navigation; typing overrides until the next navigation.
	let search = $derived(page.url.searchParams.get('q') ?? '');
	let mobileOpen = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	function isActive(href: string): boolean {
		return href === resolve('/') ? page.url.pathname === href : page.url.pathname.startsWith(href);
	}

	/** The library the search applies to: the current one, defaulting to Movies. */
	function searchTarget(): string {
		return libraryPaths.find((p) => page.url.pathname.startsWith(p)) ?? resolve('/movies');
	}

	function searchUrl(): string {
		const q = search.trim();
		const path = searchTarget();
		return q ? `${path}?q=${encodeURIComponent(q)}` : path;
	}

	function navigate(opts?: Parameters<typeof goto>[1]) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- built from resolve()d paths
		goto(searchUrl(), opts);
	}

	// Live-filter while already on a library page; elsewhere wait for submit.
	function oninput() {
		if (!libraryPaths.some((p) => page.url.pathname.startsWith(p))) return;
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(
			() => navigate({ replaceState: true, keepFocus: true, noScroll: true }),
			250
		);
	}

	function submitSearch(event: SubmitEvent) {
		event.preventDefault();
		clearTimeout(debounceTimer);
		mobileOpen = false;
		navigate();
	}
</script>

<header
	class="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60"
>
	<div class="flex h-16 page-gutter items-center gap-6">
		<a href={resolve('/')} class="text-lg font-bold tracking-[0.25em] text-primary">FINDERELLA</a>
		<form class="relative hidden w-full max-w-xs md:block" onsubmit={submitSearch}>
			<HugeiconsIcon
				icon={Search01Icon}
				class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<Input type="search" placeholder="Search…" bind:value={search} {oninput} class="pl-9" />
		</form>
		<nav class="hidden items-center gap-1 md:flex">
			{#each links as link (link.href)}
				<a
					href={link.href}
					class={cn(
						'rounded-4xl px-3.5 py-1.5 text-sm font-medium transition-colors',
						isActive(link.href)
							? 'bg-accent text-foreground'
							: 'text-muted-foreground hover:text-foreground'
					)}
				>
					{link.label}
				</a>
			{/each}
		</nav>
		<a
			href={resolve('/settings/devices')}
			aria-label="Settings"
			title="Devices & settings"
			class={cn(
				'ml-auto hidden size-9 items-center justify-center rounded-full transition-colors md:flex',
				isActive(resolve('/settings/devices'))
					? 'bg-accent text-foreground'
					: 'text-muted-foreground hover:text-foreground'
			)}
		>
			<HugeiconsIcon icon={Settings01Icon} class="size-5" />
		</a>
		<Sheet.Root bind:open={mobileOpen}>
			<Sheet.Trigger class="ml-auto md:hidden">
				{#snippet child({ props })}
					<Button {...props} variant="ghost" size="icon" aria-label="Open menu">
						<HugeiconsIcon icon={Menu01Icon} />
					</Button>
				{/snippet}
			</Sheet.Trigger>
			<Sheet.Content side="right">
				<Sheet.Header>
					<Sheet.Title class="tracking-[0.25em] text-primary">FINDERELLA</Sheet.Title>
				</Sheet.Header>
				<div class="flex flex-col gap-2 px-4">
					<form class="relative" onsubmit={submitSearch}>
						<HugeiconsIcon
							icon={Search01Icon}
							class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
						/>
						<Input type="search" placeholder="Search…" bind:value={search} {oninput} class="pl-9" />
					</form>
					{#each links as link (link.href)}
						<a
							href={link.href}
							onclick={() => (mobileOpen = false)}
							class={cn(
								'rounded-4xl px-3.5 py-2 text-sm font-medium transition-colors',
								isActive(link.href)
									? 'bg-accent text-foreground'
									: 'text-muted-foreground hover:text-foreground'
							)}
						>
							{link.label}
						</a>
					{/each}
					<a
						href={resolve('/settings/devices')}
						onclick={() => (mobileOpen = false)}
						class={cn(
							'rounded-4xl px-3.5 py-2 text-sm font-medium transition-colors',
							isActive(resolve('/settings/devices'))
								? 'bg-accent text-foreground'
								: 'text-muted-foreground hover:text-foreground'
						)}
					>
						Devices & settings
					</a>
				</div>
			</Sheet.Content>
		</Sheet.Root>
	</div>
</header>
