<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		Bookmark01Icon,
		DashboardSquare01Icon,
		Logout01Icon,
		Menu01Icon,
		Settings01Icon,
		UserMultiple02Icon
	} from '@hugeicons/core-free-icons';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu';
	import * as Sheet from '$lib/components/ui/sheet';
	import ProfileAvatar from '$lib/components/profile-avatar.svelte';
	import SearchBox from '$lib/components/search-box.svelte';
	import type { ProfileSummary } from '$lib/data/profiles';
	import { cn } from '$lib/utils.js';

	interface HeaderUser {
		name: string;
		email: string;
		image: string | null;
		isAdmin: boolean;
	}

	/**
	 * null = a guest browsing a public hub. `profile` is the one this sign-in
	 * watches as (null on the account pages reachable before picking one);
	 * `profiles` are all of the account's, for the switcher.
	 */
	let {
		user,
		profile = null,
		profiles = []
	}: {
		user: HeaderUser | null;
		profile?: ProfileSummary | null;
		profiles?: ProfileSummary[];
	} = $props();

	const otherProfiles = $derived(profiles.filter((p) => p.id !== profile?.id));

	// `path` is compared against page.url.pathname (resolve() yields relative
	// hrefs during SSR, so hrefs can't be used for the active check).
	const links = [
		{ href: resolve('/'), path: '/', label: 'Home' },
		{ href: resolve('/movies'), path: '/movies', label: 'Movies' },
		{ href: resolve('/series'), path: '/series', label: 'Series' },
		{ href: resolve('/categories'), path: '/categories', label: 'Categories' }
	];
	const uid = $props.id();
	const logoutFormId = `logout-${uid}`;

	let mobileOpen = $state(false);
	let logoutForm = $state<HTMLFormElement | null>(null);
	let switchForm = $state<HTMLFormElement | null>(null);
	// Read by the form's enhance callback, never rendered: no $state needed.
	let switchTo = '';

	/** Posts to the picker's action; it redirects back here and every load re-runs. */
	function switchProfile(id: string) {
		switchTo = id;
		mobileOpen = false;
		switchForm?.requestSubmit();
	}

	const initials = $derived.by(() => {
		if (!user) return '';
		const fromName = user.name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('');
		return fromName || user.email[0]?.toUpperCase() || '?';
	});

	function isActive(path: string): boolean {
		return path === '/'
			? page.url.pathname === path
			: page.url.pathname === path || page.url.pathname.startsWith(`${path}/`);
	}
</script>

<header
	class="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60"
>
	{#if user}
		<!-- Submitted from the user menu (desktop) and the mobile sheet. -->
		<form
			bind:this={logoutForm}
			id={logoutFormId}
			method="POST"
			action={resolve('/logout')}
			use:enhance
			class="hidden"
		></form>
		<!-- Profile switcher (menu + sheet): /profiles?/select redirects back to this
		     page. The fields are filled at submit time, from the clicked item. -->
		<form
			bind:this={switchForm}
			method="POST"
			action="{resolve('/profiles')}?/select"
			use:enhance={({ formData }) => {
				formData.set('profileId', switchTo);
				formData.set('redirectTo', page.url.pathname + page.url.search);
			}}
			class="hidden"
		></form>
	{/if}

	<div class="flex h-16 page-gutter items-center gap-6">
		<a href={resolve('/')} class="text-lg font-bold tracking-[0.25em] text-primary">FINDERELLA</a>
		<div class="hidden w-full max-w-xs md:block">
			<SearchBox />
		</div>
		<NavigationMenu.Root viewport={false} class="hidden md:flex">
			<NavigationMenu.List class="gap-1">
				{#each links as link (link.href)}
					<NavigationMenu.Item>
						<NavigationMenu.Link
							href={link.href}
							active={isActive(link.path)}
							class="rounded-4xl px-3.5 py-1.5 text-base font-medium text-muted-foreground hover:text-foreground data-active:bg-accent data-active:text-foreground"
						>
							{link.label}
						</NavigationMenu.Link>
					</NavigationMenu.Item>
				{/each}
			</NavigationMenu.List>
		</NavigationMenu.Root>

		{#if user}
			<!-- ml-auto on this wrapper pushes Watchlist + avatar to the far right. -->
			<div class="ml-auto hidden items-center gap-2 md:flex">
				<Button
					href={resolve('/watchlist')}
					variant="ghost"
					size="icon"
					aria-label="Watchlist"
					title="Watchlist"
					class={cn(
						'rounded-full',
						isActive('/watchlist')
							? 'text-foreground hover:bg-transparent'
							: 'text-muted-foreground hover:text-foreground'
					)}
				>
					<!-- Hugeicons' free set is stroke-only: the active state fills the outline path. -->
					<HugeiconsIcon
						icon={Bookmark01Icon}
						class={cn('size-5', isActive('/watchlist') && '[&_path]:fill-current')}
					/>
				</Button>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<!-- Utility classes must live on the rendered button (a class on
						     Trigger would be overridden here). -->
							<button
								{...props}
								type="button"
								aria-label="Account menu"
								class={cn(
									'shrink-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
									profile ? 'rounded-lg' : 'rounded-full'
								)}
							>
								{#if profile}
									<ProfileAvatar
										name={profile.name}
										color={profile.avatarColor}
										icon={profile.avatarIcon}
										size="sm"
									/>
								{:else}
									<Avatar.Root>
										{#if user.image}
											<Avatar.Image src={user.image} alt={user.name} />
										{/if}
										<Avatar.Fallback class="bg-primary/15 text-xs font-semibold text-primary">
											{initials}
										</Avatar.Fallback>
									</Avatar.Root>
								{/if}
							</button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="min-w-56">
						<!-- The active profile, avatar included, so it reads apart from the switch list below. -->
						<DropdownMenu.Label class="flex items-center gap-2.5">
							{#if profile}
								<ProfileAvatar
									name={profile.name}
									color={profile.avatarColor}
									icon={profile.avatarIcon}
									size="sm"
								/>
							{/if}
							<span class="truncate text-sm font-medium text-foreground">
								{profile?.name ?? user.name}
							</span>
						</DropdownMenu.Label>
						<DropdownMenu.Separator />
						<DropdownMenu.Group>
							{#each otherProfiles as other (other.id)}
								<DropdownMenu.Item onSelect={() => switchProfile(other.id)}>
									<ProfileAvatar
										name={other.name}
										color={other.avatarColor}
										icon={other.avatarIcon}
										size="xs"
									/>
									<span class="truncate">{other.name}</span>
								</DropdownMenu.Item>
							{/each}
							<DropdownMenu.Item>
								{#snippet child({ props })}
									<a href="{resolve('/profiles')}?manage" {...props}>
										<HugeiconsIcon icon={UserMultiple02Icon} />
										Manage profiles
									</a>
								{/snippet}
							</DropdownMenu.Item>
						</DropdownMenu.Group>
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
			</div>
		{:else}
			<Button href={resolve('/login')} size="sm" class="ml-auto hidden shrink-0 md:inline-flex">
				Sign in
			</Button>
		{/if}

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
					<Sheet.Description class="truncate">
						{#if user}
							{profile?.name ?? user.name}
						{:else}
							Browsing as a guest
						{/if}
					</Sheet.Description>
				</Sheet.Header>
				<div class="flex flex-col gap-2 px-4">
					<SearchBox layout="inline" onNavigate={() => (mobileOpen = false)} />
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
					{#if user}
						<a
							href={resolve('/watchlist')}
							onclick={() => (mobileOpen = false)}
							class={cn(
								'rounded-4xl px-3.5 py-2 text-sm font-medium transition-colors',
								isActive('/watchlist')
									? 'bg-accent text-foreground'
									: 'text-muted-foreground hover:text-foreground'
							)}
						>
							Watchlist
						</a>
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
						{#if otherProfiles.length > 0}
							<p class="px-3.5 pt-2 text-xs font-medium text-muted-foreground">Switch profile</p>
							{#each otherProfiles as other (other.id)}
								<button
									type="button"
									onclick={() => switchProfile(other.id)}
									class="flex items-center gap-2.5 rounded-4xl px-3.5 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
								>
									<ProfileAvatar
										name={other.name}
										color={other.avatarColor}
										icon={other.avatarIcon}
										size="xs"
									/>
									<span class="truncate">{other.name}</span>
								</button>
							{/each}
						{/if}
						<a
							href="{resolve('/profiles')}?manage"
							onclick={() => (mobileOpen = false)}
							class="rounded-4xl px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
						>
							Manage profiles
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
					{:else}
						<a
							href={resolve('/login')}
							onclick={() => (mobileOpen = false)}
							class="rounded-4xl px-3.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
						>
							Sign in
						</a>
					{/if}
				</div>
			</Sheet.Content>
		</Sheet.Root>
	</div>
</header>
