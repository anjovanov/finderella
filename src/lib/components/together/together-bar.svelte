<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		Cancel01Icon,
		CrownIcon,
		Link01Icon,
		Logout01Icon,
		MoreVerticalIcon,
		UserRemove01Icon
	} from '@hugeicons/core-free-icons';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ProfileAvatar from '$lib/components/profile-avatar.svelte';
	import type { TogetherSession } from '$lib/together/session.svelte';
	import { cn } from '$lib/utils';

	let {
		party,
		onInvite,
		onLeave,
		menuOpen = $bindable(false)
	}: {
		party: TogetherSession;
		/** Opens the invite dialog (link + copy). */
		onInvite: () => void;
		/** Leave the party but keep watching alone. */
		onLeave: () => void;
		/** Mirrors the ⋮ menu so the player can keep its chrome pinned while it's open. */
		menuOpen?: boolean;
	} = $props();

	const MAX_AVATARS = 4;
	const shown = $derived(party.participants.slice(0, MAX_AVATARS));
	const extra = $derived(party.participants.length - shown.length);

	let confirmEnd = $state(false);
</script>

<div class="flex items-center gap-2">
	<button
		type="button"
		class="flex items-center rounded-full py-1 pr-1 pl-1 transition-colors hover:bg-white/15"
		aria-label="Watch party: {party.participants.length} watching. Invite people"
		onclick={onInvite}
	>
		<span class="flex -space-x-1.5">
			{#each shown as person (person.id)}
				<ProfileAvatar
					name={person.name}
					color={person.avatarColor}
					icon={person.avatarIcon}
					size="xs"
					class={cn(
						'ring-2 ring-black',
						!person.connected && 'opacity-40',
						party.state?.waiting && party.state.waitingFor.includes(person.id) && 'animate-pulse'
					)}
				/>
			{/each}
		</span>
		{#if extra > 0}
			<span class="pl-1.5 text-xs font-medium text-white/80">+{extra}</span>
		{/if}
	</button>

	<DropdownMenu.Root bind:open={menuOpen}>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					aria-label="Watch party options"
					class="flex size-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
				>
					<HugeiconsIcon icon={MoreVerticalIcon} class="size-6" />
				</button>
			{/snippet}
		</DropdownMenu.Trigger>
		<!-- `dark`: portalled out of the player, but it sits over the video. -->
		<DropdownMenu.Content align="end" class="dark min-w-64">
			<DropdownMenu.Group>
				<DropdownMenu.Label>Watching together</DropdownMenu.Label>
				{#each party.participants as person (person.id)}
					{#if party.isHost && person.id !== party.me}
						<DropdownMenu.Sub>
							<DropdownMenu.SubTrigger>
								{@render personRow(person)}
							</DropdownMenu.SubTrigger>
							<DropdownMenu.SubContent class="dark">
								<DropdownMenu.Item variant="destructive" onSelect={() => party.kick(person.id)}>
									<HugeiconsIcon icon={UserRemove01Icon} />
									Remove from party
								</DropdownMenu.Item>
							</DropdownMenu.SubContent>
						</DropdownMenu.Sub>
					{:else}
						<div class="flex items-center gap-2 px-2 py-1.5 text-sm">
							{@render personRow(person)}
						</div>
					{/if}
				{/each}
			</DropdownMenu.Group>
			<DropdownMenu.Separator />
			<DropdownMenu.Item onSelect={onInvite}>
				<HugeiconsIcon icon={Link01Icon} />
				Invite people
			</DropdownMenu.Item>
			<DropdownMenu.Item onSelect={onLeave}>
				<HugeiconsIcon icon={Logout01Icon} />
				Leave party
			</DropdownMenu.Item>
			{#if party.isHost}
				<DropdownMenu.Item variant="destructive" onSelect={() => (confirmEnd = true)}>
					<HugeiconsIcon icon={Cancel01Icon} />
					End party for everyone
				</DropdownMenu.Item>
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>

{#snippet personRow(person: (typeof party.participants)[number])}
	<ProfileAvatar
		name={person.name}
		color={person.avatarColor}
		icon={person.avatarIcon}
		size="xs"
		class={person.connected ? undefined : 'opacity-40'}
	/>
	<span class="min-w-0 flex-1 truncate">
		{person.name}
		{#if person.id === party.me}
			<span class="text-muted-foreground">(you)</span>
		{/if}
	</span>
	{#if person.isHost}
		<HugeiconsIcon icon={CrownIcon} class="size-4 text-primary" aria-label="Host" />
	{:else if !person.connected}
		<span class="text-xs text-muted-foreground">reconnecting</span>
	{/if}
{/snippet}

<AlertDialog.Root bind:open={confirmEnd}>
	<AlertDialog.Content class="dark">
		<AlertDialog.Header>
			<AlertDialog.Title>End the watch party?</AlertDialog.Title>
			<AlertDialog.Description>
				Everyone keeps watching on their own, and the invite link stops working.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={() => party.endForEveryone()}>
				End party
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
