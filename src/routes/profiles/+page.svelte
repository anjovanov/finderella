<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { PencilEdit01Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
	import ProfileAvatar, { PROFILE_ICON_COMPONENTS } from '$lib/components/profile-avatar.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import {
		DEFAULT_PROFILE_COLOR,
		PROFILE_COLORS,
		PROFILE_ICON_LABELS,
		PROFILE_ICONS,
		PROFILE_NAME_MAX,
		profileInitial,
		type ProfileColor,
		type ProfileIcon,
		type ProfileSummary
	} from '$lib/data/profiles';
	import { canAddProfile } from '$lib/data/account-limits';
	import { DialogForm } from '$lib/dialog-form.svelte';
	import { cn } from '$lib/utils.js';

	let { data, form } = $props();

	// Pick mode submits the select form; manage mode opens the editor instead.
	// The mode lives in the URL (`?manage`): Edit/Done are links, the navbar's
	// "Manage profiles" link lands here in manage mode, and saving (which
	// re-runs the load) or reloading keeps it.
	const managing = $derived(data.manage);
	// Carried across the mode links so picking still returns to the page the viewer came from.
	const redirectParam = $derived(
		data.redirectTo === '/' ? '' : `redirectTo=${encodeURIComponent(data.redirectTo)}`
	);
	let busy = $state(false);

	const canAdd = $derived(canAddProfile(data.profiles.length, data.maxProfiles));

	// One dialog for add + edit: `editor.target` is the profile being edited, null = new.
	const editor = new DialogForm<ProfileSummary>();
	const remove = new DialogForm<ProfileSummary>();

	let name = $state('');
	let color = $state<ProfileColor>(DEFAULT_PROFILE_COLOR);
	// '' = the name's initial (posted as-is, stored as null).
	let icon = $state<ProfileIcon | ''>('');

	function openEditor(profile: ProfileSummary | null = null) {
		name = profile?.name ?? '';
		color = profile?.avatarColor ?? unusedColor();
		icon = profile?.avatarIcon ?? '';
		editor.show(profile);
	}

	/** New profiles start on a color no other profile of the account uses yet. */
	function unusedColor(): ProfileColor {
		const taken = new Set(data.profiles.map((p) => p.avatarColor));
		return PROFILE_COLORS.find((c) => !taken.has(c.value))?.value ?? DEFAULT_PROFILE_COLOR;
	}

	function confirmDelete(profile: ProfileSummary) {
		editor.close();
		remove.show(profile);
	}

	const toggleButton = 'h-12 min-w-36 px-8 text-base';
	const tileLabel =
		'w-full truncate text-center text-sm text-muted-foreground transition-colors group-hover:text-foreground sm:text-base';
	const optionTile =
		'flex aspect-square cursor-pointer items-center justify-center rounded-xl border transition-colors has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:ring-2 has-focus-visible:ring-ring hover:bg-muted/60';
</script>

<!-- Manage mode: the edit pencil stands in for the avatar's icon/initial. -->
{#snippet editGlyph()}
	<span class="rounded-full border-2 border-white p-2 sm:p-2.5">
		<HugeiconsIcon icon={PencilEdit01Icon} class="size-6 sm:size-8" />
	</span>
{/snippet}

<svelte:head>
	<title>{managing ? 'Manage profiles' : "Who's watching?"} · Finderella</title>
</svelte:head>

<div class="flex min-h-svh page-gutter flex-col items-center justify-center gap-10 py-12">
	<p class="text-center text-xl font-bold tracking-[0.25em] text-primary">FINDERELLA</p>
	<div class="flex flex-col items-center gap-3 text-center">
		<h1 class="text-3xl font-semibold tracking-tight sm:text-5xl">
			{managing ? 'Manage profiles' : "Who's watching?"}
		</h1>
		{#if managing}
			<p class="text-sm text-muted-foreground sm:text-base">
				Choose a profile to rename it or change its look. {data.maxProfiles === null
					? 'Several people'
					: `Up to ${data.maxProfiles} people`} can share this account, each with their own progress,
				watchlist and settings.
			</p>
		{/if}
	</div>

	<form
		method="POST"
		action="?/select"
		class="flex max-w-3xl flex-wrap justify-center gap-6 sm:gap-8"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<input type="hidden" name="redirectTo" value={data.redirectTo} />
		{#each data.profiles as profile (profile.id)}
			<button
				type={managing ? 'button' : 'submit'}
				name={managing ? undefined : 'profileId'}
				value={managing ? undefined : profile.id}
				disabled={busy}
				aria-label={managing ? `Edit ${profile.name}` : undefined}
				aria-current={!managing && profile.id === data.activeId ? 'true' : undefined}
				onclick={managing ? () => openEditor(profile) : undefined}
				class="group flex w-24 flex-col items-center gap-3 outline-none disabled:opacity-60 sm:w-32"
			>
				<ProfileAvatar
					name={profile.name}
					color={profile.avatarColor}
					icon={profile.avatarIcon}
					size="xl"
					class={cn(
						'ring-offset-4 ring-offset-background transition-[box-shadow,transform] duration-150 group-hover:scale-105 group-hover:ring-2 group-hover:ring-foreground group-focus-visible:ring-2 group-focus-visible:ring-primary motion-reduce:transition-none motion-reduce:group-hover:scale-100',
						!managing && profile.id === data.activeId && 'ring-2 ring-primary'
					)}
					children={managing ? editGlyph : undefined}
				/>
				<span class={tileLabel}>{profile.name}</span>
			</button>
		{/each}
		{#if canAdd}
			<button
				type="button"
				disabled={busy}
				onclick={() => openEditor()}
				class="group flex w-24 flex-col items-center gap-3 outline-none disabled:opacity-60 sm:w-32"
			>
				<span
					class="flex size-24 items-center justify-center rounded-3xl border-2 border-dashed border-foreground/25 text-muted-foreground transition-colors group-hover:border-foreground/60 group-hover:text-foreground group-focus-visible:border-primary sm:size-32"
				>
					<HugeiconsIcon icon={PlusSignIcon} class="size-10 sm:size-12" />
				</span>
				<span class={tileLabel}>Add profile</span>
			</button>
		{/if}
	</form>

	{#if form && 'message' in form && form.message}
		<p role="alert" class="text-sm text-destructive">{form.message}</p>
	{/if}

	<!-- Links, not toggles: the mode is part of the URL. Same size in both modes so
	     switching doesn't shift the page; replacestate keeps Back meaning "leave". -->
	{#if managing}
		<Button
			size="lg"
			class={toggleButton}
			href="{resolve('/profiles')}{redirectParam ? `?${redirectParam}` : ''}"
			data-sveltekit-replacestate
			data-sveltekit-noscroll
		>
			Done
		</Button>
	{:else}
		<Button
			size="lg"
			variant="outline"
			class={toggleButton}
			href="{resolve('/profiles')}?manage{redirectParam ? `&${redirectParam}` : ''}"
			data-sveltekit-replacestate
			data-sveltekit-noscroll
		>
			Edit
		</Button>
	{/if}
</div>

<!-- Add / edit -->
<Dialog.Root bind:open={editor.open}>
	<Dialog.Content class="sm:max-w-lg">
		<form
			method="POST"
			action={editor.target ? '?/update' : '?/create'}
			class="flex flex-col gap-6"
			use:enhance={editor.submit}
		>
			<Dialog.Header>
				<Dialog.Title>{editor.target ? 'Edit profile' : 'Add a profile'}</Dialog.Title>
				<Dialog.Description>
					{#if !editor.target}
						Someone else watching on this account? Give them their own profile.
					{:else if editor.target.isPrimary}
						The account's main profile. It can be renamed but not deleted.
					{:else}
						Change how this profile looks in the profile picker.
					{/if}
				</Dialog.Description>
			</Dialog.Header>
			{#if editor.target}
				<input type="hidden" name="profileId" value={editor.target.id} />
			{/if}

			<div class="flex items-center gap-4">
				<ProfileAvatar name={name || '?'} {color} icon={icon || null} size="lg" />
				<Field.Field class="flex-1" data-invalid={editor.error ? true : undefined}>
					<Field.Label for="profile-name">Name</Field.Label>
					<Input
						id="profile-name"
						name="name"
						autocomplete="off"
						maxlength={PROFILE_NAME_MAX}
						required
						bind:value={name}
						aria-invalid={editor.error ? true : undefined}
					/>
				</Field.Field>
			</div>

			<fieldset>
				<legend class="mb-2.5 text-sm font-medium">Color</legend>
				<div class="grid grid-cols-6 gap-3 sm:grid-cols-12 sm:gap-2">
					{#each PROFILE_COLORS as option (option.value)}
						<label
							class="aspect-square cursor-pointer rounded-full ring-offset-2 ring-offset-background transition-shadow has-checked:ring-2 has-checked:ring-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring"
							style:background-color={option.css}
							title={option.label}
						>
							<input
								type="radio"
								name="avatarColor"
								value={option.value}
								bind:group={color}
								class="sr-only"
							/>
							<span class="sr-only">{option.label}</span>
						</label>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend class="mb-2.5 text-sm font-medium">Icon</legend>
				<div class="grid grid-cols-7 gap-2">
					<label class={cn(optionTile, 'text-sm font-semibold')} title="Initial">
						<input type="radio" name="avatarIcon" value="" bind:group={icon} class="sr-only" />
						<span aria-hidden="true">{profileInitial(name)}</span>
						<span class="sr-only">Initial</span>
					</label>
					{#each PROFILE_ICONS as option (option)}
						<label class={optionTile} title={PROFILE_ICON_LABELS[option]}>
							<input
								type="radio"
								name="avatarIcon"
								value={option}
								bind:group={icon}
								class="sr-only"
							/>
							<HugeiconsIcon icon={PROFILE_ICON_COMPONENTS[option]} class="size-5" />
							<span class="sr-only">{PROFILE_ICON_LABELS[option]}</span>
						</label>
					{/each}
				</div>
			</fieldset>

			{#if editor.error}<Field.Error>{editor.error}</Field.Error>{/if}

			<Dialog.Footer>
				{#if editor.target && !editor.target.isPrimary}
					{@const target = editor.target}
					<!-- mr-auto: pinned left of Cancel/Save on wide screens. -->
					<Button
						type="button"
						variant="ghost"
						class="text-destructive hover:text-destructive sm:mr-auto"
						onclick={() => confirmDelete(target)}
					>
						Delete profile
					</Button>
				{/if}
				<Button type="button" variant="outline" onclick={editor.close}>Cancel</Button>
				<Button type="submit" disabled={editor.busy}>
					{#if editor.target}
						{editor.busy ? 'Saving…' : 'Save'}
					{:else}
						{editor.busy ? 'Adding…' : 'Add profile'}
					{/if}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete -->
<AlertDialog.Root bind:open={remove.open}>
	<AlertDialog.Content>
		{#if remove.target}
			<AlertDialog.Header>
				<AlertDialog.Title>Delete {remove.target.name}?</AlertDialog.Title>
				<AlertDialog.Description>
					The profile's watch progress, Continue watching, watchlist and settings are deleted with
					it. Plays stay in the server's statistics. This can't be undone.
				</AlertDialog.Description>
			</AlertDialog.Header>
			{#if remove.error}<p class="text-sm text-destructive">{remove.error}</p>{/if}
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<form method="POST" action="?/delete" use:enhance={remove.submit}>
					<input type="hidden" name="profileId" value={remove.target.id} />
					<Button type="submit" variant="destructive" class="w-full" disabled={remove.busy}>
						Delete profile
					</Button>
				</form>
			</AlertDialog.Footer>
		{/if}
	</AlertDialog.Content>
</AlertDialog.Root>
