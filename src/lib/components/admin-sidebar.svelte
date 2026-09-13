<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		ArrowLeft01Icon,
		DashboardSquare01Icon,
		HardDriveIcon,
		Settings01Icon,
		SubtitleIcon,
		UserGroupIcon
	} from '@hugeicons/core-free-icons';
	import * as Sidebar from '$lib/components/ui/sidebar';

	const items = [
		{ href: resolve('/admin'), label: 'Overview', icon: DashboardSquare01Icon, exact: true },
		{ href: resolve('/admin/devices'), label: 'Devices', icon: HardDriveIcon, exact: false },
		{ href: resolve('/admin/users'), label: 'Users', icon: UserGroupIcon, exact: false },
		{ href: resolve('/admin/subtitles'), label: 'Subtitles', icon: SubtitleIcon, exact: false },
		{ href: resolve('/admin/settings'), label: 'Site settings', icon: Settings01Icon, exact: false }
	];

	function isActive(item: (typeof items)[number]): boolean {
		return item.exact
			? page.url.pathname === item.href
			: page.url.pathname === item.href || page.url.pathname.startsWith(`${item.href}/`);
	}
</script>

<Sidebar.Root collapsible="icon">
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg" tooltipContent="Finderella">
					{#snippet child({ props })}
						<a href={resolve('/')} {...props}>
							<span
								class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
							>
								F
							</span>
							<span class="flex flex-col leading-tight">
								<span class="font-bold tracking-[0.25em] text-primary">FINDERELLA</span>
								<span class="text-xs text-muted-foreground">Administration</span>
							</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>Manage</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each items as item (item.href)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={isActive(item)} tooltipContent={item.label}>
								{#snippet child({ props })}
									<a href={item.href} {...props}>
										<HugeiconsIcon icon={item.icon} />
										<span>{item.label}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>

	<Sidebar.Footer>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton tooltipContent="Back to Finderella">
					{#snippet child({ props })}
						<a href={resolve('/')} {...props}>
							<HugeiconsIcon icon={ArrowLeft01Icon} />
							<span>Back to Finderella</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>
