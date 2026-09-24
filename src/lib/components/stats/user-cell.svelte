<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Avatar from '$lib/components/ui/avatar';
	import type { StatUser } from '$lib/data/stats';

	/** Avatar + name linking to the user's statistics; null = a guest viewer. */
	let { user, size = 'sm' }: { user: StatUser | null; size?: 'sm' | 'default' } = $props();

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
		<span class="truncate group-hover:underline">{user.name}</span>
	</a>
{:else}
	<span class="flex min-w-0 items-center gap-2 text-muted-foreground">
		{@render avatar()}
		<span class="truncate">Guest</span>
	</span>
{/if}
