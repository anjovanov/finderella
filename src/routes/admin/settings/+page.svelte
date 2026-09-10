<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Switch } from '$lib/components/ui/switch';

	let { data, form } = $props();

	let settingsForm = $state<HTMLFormElement | null>(null);
	let allowRegistration = $derived(data.settings.allowRegistration);
	let saving = $state(false);
</script>

<svelte:head>
	<title>Site settings · Finderella</title>
</svelte:head>

<div>
	<h1 class="text-2xl font-semibold">Site settings</h1>
	<p class="text-sm text-muted-foreground">Hub-wide options and catalog housekeeping.</p>
</div>

<!-- Accounts -->
<Card.Root>
	<Card.Header>
		<Card.Title>Accounts</Card.Title>
		<Card.Description>Who can create an account on this server.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			bind:this={settingsForm}
			method="POST"
			action="?/updateSettings"
			use:enhance={() => {
				saving = true;
				return async ({ update }) => {
					saving = false;
					await update();
				};
			}}
		>
			<input type="hidden" name="allowRegistration" value={allowRegistration ? 'true' : 'false'} />
			<Field.Group>
				<Field.Field orientation="horizontal">
					<Field.Content>
						<Field.Label for="allow-registration">Open registration</Field.Label>
						<Field.Description>
							Anyone who can reach this server may sign up at <span class="font-mono"
								>/register</span
							>. When off, only administrators can create accounts (from the Users page).
							Registration is always open while the server has no accounts at all.
						</Field.Description>
					</Field.Content>
					<Switch
						id="allow-registration"
						bind:checked={allowRegistration}
						disabled={saving}
						onCheckedChange={async () => {
							await tick();
							settingsForm?.requestSubmit();
						}}
					/>
				</Field.Field>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>

<!-- Catalog housekeeping -->
<Card.Root>
	<Card.Header>
		<Card.Title>Catalog</Card.Title>
		<Card.Description>
			{#if data.orphans.movies === 0 && data.orphans.series === 0}
				Every title in the catalog is backed by a media file.
			{:else}
				{data.orphans.movies}
				{data.orphans.movies === 1 ? 'movie' : 'movies'} and {data.orphans.series} series have no media
				files (placeholder titles, or files from a removed library). Titles are also pruned automatically
				when a scan finishes.
			{/if}
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		<form
			method="POST"
			action="?/pruneCatalog"
			use:enhance
			onsubmit={(e) => {
				if (!confirm('Remove every title that has no media file? Their watch history goes too.')) {
					e.preventDefault();
				}
			}}
		>
			<Button
				type="submit"
				variant="secondary"
				size="sm"
				disabled={data.orphans.movies === 0 && data.orphans.series === 0}
			>
				Remove titles without files
			</Button>
		</form>
		{#if form && 'pruned' in form && form.pruned}
			<p class="text-xs text-muted-foreground">
				Removed {form.pruned.movies} movies and {form.pruned.series} series ({form.pruned.episodes} episodes).
			</p>
		{/if}
	</Card.Content>
</Card.Root>

<!-- Metadata -->
<Card.Root>
	<Card.Header>
		<Card.Title>Metadata</Card.Title>
		<Card.Description>
			{#if !data.metadata.configured}
				Set <span class="font-mono">TMDB_API_KEY</span> in the hub's
				<span class="font-mono">.env</span> to fetch posters, synopses, genres, cast and ratings for scanned
				titles automatically.
			{:else if data.metadata.running}
				Fetching metadata from TMDB… ({data.metadata.pending.movies} movies,
				{data.metadata.pending.series} series, {data.metadata.pending.episodes} episodes pending)
			{:else if data.metadata.pending.movies + data.metadata.pending.series + data.metadata.pending.episodes > 0}
				TMDB configured · {data.metadata.pending.movies} movies, {data.metadata.pending.series} series
				and {data.metadata.pending.episodes} episodes are waiting for metadata (fetched after the next
				scan, or refresh now).
			{:else}
				TMDB configured · every title has been looked up.
			{/if}
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		<form
			method="POST"
			action="?/refreshMetadata"
			use:enhance={() =>
				async ({ update }) => {
					await update();
					setTimeout(() => invalidateAll(), 3000);
				}}
		>
			<Button
				type="submit"
				variant="secondary"
				size="sm"
				disabled={!data.metadata.configured || data.metadata.running}
			>
				Refresh all metadata
			</Button>
		</form>
		{#if form && 'refreshing' in form && form.refreshing}
			<p class="text-xs text-muted-foreground">
				Refreshing every title in the background; unmatched titles are searched again.
			</p>
		{/if}
		{#if form && 'message' in form && form.message}
			<p class="text-sm text-destructive">{form.message}</p>
		{/if}
		<p class="text-xs text-muted-foreground">
			Metadata and artwork provided by
			<a href="https://www.themoviedb.org" class="underline" rel="noreferrer" target="_blank"
				>TMDB</a
			>. This product uses the TMDB API but is not endorsed or certified by TMDB.
		</p>
	</Card.Content>
</Card.Root>
