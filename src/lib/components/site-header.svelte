<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		DashboardSquare01Icon,
		Logout01Icon,
		Menu01Icon,
		Search01Icon,
		Settings01Icon
	} from '@hugeicons/core-free-icons';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu';
	import * as Sheet from '$lib/components/ui/sheet';
	import { cn } from '$lib/utils.js';

	interface HeaderUser {
		name: string;
		email: string;
		image: string | null;
		isAdmin: boolean;
	}

	let { user }: { user: HeaderUser } = $props();

	// `path` is compared against page.url.pathname (resolve() yields relative
	// hrefs during SSR, so hrefs can't be used for the active check).
	const links = [
		{ href: resolve('/'), path: '/', label: 'Home' },
		{ href: resolve('/movies'), path: '/movies', label: 'Movies' },
		{ href: resolve('/series'), path: '/series', label: 'Series' },
		{ href: resolve('/categories'), path: '/categories', label: 'Categories' }
	];
	const libraryPaths = [resolve('/movies'), resolve('/series')];
	const uid = $props.id();
	const logoutFormId = `logout-${uid}`;

	// Syncs with the URL's ?q= on navigation; typing overrides until the next navigation.
	let search = $derived(page.url.searchParams.get('q') ?? '');
	let mobileOpen = $state(false);
	let logoutForm = $state<HTMLFormElement | null>(null);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	const initials = $derived(
		user.name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('') ||
			user.email[0]?.toUpperCase() ||
			'?'
	);

	function isActive(path: string): boolean {
		return path === '/'
			? page.url.pathname === path
			: page.url.pathname === path || page.url.pathname.startsWith(`${path}/`);
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
	<!-- Submitted from the user menu (desktop) and the mobile sheet. -->
	<form
		bind:this={logoutForm}
		id={logoutFormId}
		method="POST"
		action={resolve('/logout')}
		use:enhance
		class="hidden"
	></form>

	<div class="flex h-16 page-gutter items-center gap-6">
		<a href={resolve('/')} class="text-lg font-bold tracking-[0.25em] text-primary">FINDERELLA</a>
		<form class="relative hidden w-full max-w-xs md:block" onsubmit={submitSearch}>
			<HugeiconsIcon
				icon={Search01Icon}
				class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<Input type="search" placeholder="Search…" bind:value={search} {oninput} class="pl-9" />
		</form>
		<NavigationMenu.Root viewport={false} class="hidden md:flex">
			<NavigationMenu.List class="gap-1">
				{#each links as link (link.href)}
					<NavigationMenu.Item>
						<NavigationMenu.Link
							href={link.href}
							active={isActive(link.path)}
							class="rounded-4xl px-3.5 py-1.5 font-medium text-muted-foreground hover:text-foreground data-active:bg-accent data-active:text-foreground"
						>
							{link.label}
						</NavigationMenu.Link>
					</NavigationMenu.Item>
				{/each}
			</NavigationMenu.List>
		</NavigationMenu.Root>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<!-- ml-auto pushes the menu to the far right; it must live on the
					     rendered button (a class on Trigger would be overridden here). -->
					<button
						{...props}
						type="button"
						aria-label="Account menu"
						class="ml-auto hidden shrink-0 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:block"
					>
						<Avatar.Root>
							{#if user.image}
								<Avatar.Image src={user.image} alt={user.name} />
							{/if}
							<Avatar.Fallback class="bg-primary/15 text-xs font-semibold text-primary">
								{initials}
							</Avatar.Fallback>
						</Avatar.Root>
					</button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="min-w-56">
				<DropdownMenu.Label class="flex flex-col gap-0.5">
					<span class="truncate text-sm font-medium text-foreground">{user.name}</span>
					<span class="truncate">{user.email}</span>
				</DropdownMenu.Label>
				<DropdownMenu.Separator />
				<DropdownMenu.Group>
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a href={resolve('/settings')} {...props}>
								<HugeiconsIcon icon={Settings01Icon} />
								Settings
							</a>
						{/snippet}
					</DropdownMenu.Item>
					{#if user.isAdmin}
						<DropdownMenu.Item>
							{#snippet child({ props })}
								<a href={resolve('/admin')} {...props}>
									<HugeiconsIcon icon={DashboardSquare01Icon} />
									Admin dashboard
								</a>
							{/snippet}
						</DropdownMenu.Item>
					{/if}
					<DropdownMenu.Item variant="destructive" onSelect={() => logoutForm?.requestSubmit()}>
						<HugeiconsIcon icon={Logout01Icon} />
						Sign out
					</DropdownMenu.Item>
				</DropdownMenu.Group>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

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
					<Sheet.Description class="truncate">{user.email}</Sheet.Description>
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
								isActive(link.path)
									? 'bg-accent text-foreground'
									: 'text-muted-foreground hover:text-foreground'
							)}
						>
							{link.label}
						</a>
					{/each}
					<a
						href={resolve('/settings')}
						onclick={() => (mobileOpen = false)}
						class={cn(
							'rounded-4xl px-3.5 py-2 text-sm font-medium transition-colors',
							isActive('/settings')
								? 'bg-accent text-foreground'
								: 'text-muted-foreground hover:text-foreground'
						)}
					>
						Settings
					</a>
					{#if user.isAdmin}
						<a
							href={resolve('/admin')}
							onclick={() => (mobileOpen = false)}
							class="rounded-4xl px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
						>
							Admin dashboard
						</a>
					{/if}
					<button
						type="submit"
						form={logoutFormId}
						class="rounded-4xl px-3.5 py-2 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
					>
						Sign out
					</button>
				</div>
			</Sheet.Content>
		</Sheet.Root>
	</div>
</header>
