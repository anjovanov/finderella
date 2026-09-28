<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Avatar from '$lib/components/ui/avatar';
	import type { StatUser } from '$lib/data/stats';

	/**
	 * Avatar + name linking to the user's statistics; null = a guest viewer.
	 * `profile` names the account profile that watched — shown after the name
	 * unless it just repeats it (a one-profile account named like its owner).
	 */
	let {
		user,
		profile = null,
		size = 'sm'
	}: { user: StatUser | null; profile?: string | null; size?: 'sm' | 'default' } = $props();

	const profileLabel = $derived(
		user && profile && profile.trim().toLowerCase() !== user.name.trim().toLowerCase()
			? profile
			: null
	);

	const initials = $derived(
		(user?.name ?? 'Guest')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('') || '?'
	);
</script>

{#snippet avatar()}
	<Avatar.Root class={size === 'sm' ? 'size-6' : 'size-8'}>
		{#if user?.image}
			<Avatar.Image src={user.image} alt="" />
		{/if}
		<Avatar.Fallback class="bg-primary/15 text-[0.625rem] font-semibold text-primary">
			{initials}
		</Avatar.Fallback>
	</Avatar.Root>
{/snippet}

{#if user}
	<a
		href={resolve('/admin/statistics/users/[id]', { id: user.id })}
		class="group flex min-w-0 items-center gap-2"
	>
		{@render avatar()}
		<span class="truncate">
			<span class="group-hover:underline">{user.name}</span>
			{#if profileLabel}
				<span class="text-muted-foreground">· {profileLabel}</span>
			{/if}
		</span>
	</a>
{:else}
	<span class="flex min-w-0 items-center gap-2 text-muted-foreground">
		{@render avatar()}
		<span class="truncate">Guest</span>
	</span>
{/if}
