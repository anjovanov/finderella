<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let { data, form } = $props();

	function formatWhen(iso: string | null): string {
		if (!iso) return 'never';
		return new Date(iso).toLocaleString();
	}
</script>

<svelte:head>
	<title>Devices · Finderella</title>
</svelte:head>

<main class="mx-auto flex w-full max-w-4xl page-gutter flex-col gap-8 py-10">
	<div class="flex items-center justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold">Devices</h1>
			<p class="text-sm text-muted-foreground">
				Storage gateways (media agents) serving your libraries to this Finderella server.
			</p>
		</div>
		<form method="POST" action="?/signOut" use:enhance>
			<Button type="submit" variant="outline" size="sm">Sign out</Button>
		</form>
	</div>

	<!-- Pair a new device -->
	<section class="rounded-2xl border border-border bg-card p-6">
		<h2 class="text-lg font-medium">Pair a new device</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			Generate a one-time code, then run the finderella-storage-gateway CLI on the device that holds
			your media.
		</p>
		<form method="POST" action="?/createCode" class="mt-4 flex gap-2" use:enhance>
			<Input name="name" placeholder="Device name (e.g. Office PC)" class="max-w-xs" />
			<Button type="submit">Generate code</Button>
		</form>

		{#if form && 'code' in form && form.code}
			<div class="mt-4 rounded-xl border border-primary/30 bg-primary/10 p-4">
				<p class="text-sm text-muted-foreground">Pairing code (valid 10 minutes):</p>
				<p class="mt-1 font-mono text-2xl font-bold tracking-[0.35em] text-primary">{form.code}</p>
				<p class="mt-3 text-sm text-muted-foreground">On the device, run:</p>
				<code class="mt-1 block overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs">
					finderella-storage-gateway pair --hub {typeof location !== 'undefined'
						? location.origin
						: ''} --code
					{form.code}
				</code>
				<p class="mt-2 text-xs text-muted-foreground">
					…then <span class="font-mono">finderella-storage-gateway connect</span> to bring it online.
				</p>
			</div>
		{:else if data.pendingCodes.length > 0}
			<p class="mt-3 text-xs text-muted-foreground">
				Pending codes: {data.pendingCodes.map((c) => `${c.code} (${c.gatewayName})`).join(', ')}
			</p>
		{/if}
	</section>

	<!-- Catalog housekeeping -->
	<section class="rounded-2xl border border-border bg-card p-6">
		<h2 class="text-lg font-medium">Catalog</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			{#if data.orphans.movies === 0 && data.orphans.series === 0}
				Every title in the catalog is backed by a media file.
			{:else}
				{data.orphans.movies}
				{data.orphans.movies === 1 ? 'movie' : 'movies'} and {data.orphans.series} series have no media
				files (placeholder titles, or files from a removed library). Titles are also pruned automatically
				when a scan finishes.
			{/if}
		</p>
		<form
			method="POST"
			action="?/pruneCatalog"
			class="mt-4"
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
			<p class="mt-3 text-xs text-muted-foreground">
				Removed {form.pruned.movies} movies and {form.pruned.series} series ({form.pruned.episodes} episodes).
			</p>
		{/if}
	</section>

	<!-- Metadata -->
	<section class="rounded-2xl border border-border bg-card p-6">
		<h2 class="text-lg font-medium">Metadata</h2>
		<p class="mt-1 text-sm text-muted-foreground">
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
		</p>
		<form
			method="POST"
			action="?/refreshMetadata"
			class="mt-4"
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
			<p class="mt-3 text-xs text-muted-foreground">
				Refreshing every title in the background; unmatched titles are searched again.
			</p>
		{/if}
		<p class="mt-4 text-xs text-muted-foreground">
			Metadata and artwork provided by
			<a href="https://www.themoviedb.org" class="underline" rel="noreferrer" target="_blank"
				>TMDB</a
			>. This product uses the TMDB API but is not endorsed or certified by TMDB.
		</p>
	</section>

	<!-- Devices -->
	{#if data.gateways.length === 0}
		<p class="text-sm text-muted-foreground">No devices paired yet.</p>
	{/if}

	{#each data.gateways as device (device.id)}
		<section class="rounded-2xl border border-border bg-card p-6">
			<div class="flex flex-wrap items-center gap-3">
				<span
					class={[
						'inline-block size-2.5 rounded-full',
						device.online ? 'bg-emerald-400' : 'bg-neutral-600'
					]}
					title={device.online ? 'Online' : 'Offline'}
				></span>
				<h2 class="text-lg font-medium">{device.name}</h2>
				<span class="text-xs text-muted-foreground">
					{device.online ? 'online' : `last seen ${formatWhen(device.lastSeenAt)}`}
					{#if device.gatewayVersion}· v{device.gatewayVersion}{/if}
					· {device.ffmpeg ? 'transcoding available' : 'no ffmpeg'}
				</span>
				<form
					method="POST"
					action="?/renameGateway"
					class="ml-auto"
					use:enhance
					onsubmit={(e) => {
						const name = prompt('Rename device', device.name)?.trim();
						if (!name) {
							e.preventDefault();
							return;
						}
						const input = e.currentTarget.querySelector<HTMLInputElement>('input[name="name"]');
						if (input) input.value = name;
					}}
				>
					<input type="hidden" name="gatewayId" value={device.id} />
					<input type="hidden" name="name" value="" />
					<Button type="submit" variant="ghost" size="sm">Rename</Button>
				</form>
				<form
					method="POST"
					action="?/revokeGateway"
					use:enhance
					onsubmit={(e) => {
						if (
							!confirm(`Revoke "${device.name}"? It will be disconnected and must be paired again.`)
						) {
							e.preventDefault();
						}
					}}
				>
					<input type="hidden" name="gatewayId" value={device.id} />
					<Button type="submit" variant="ghost" size="sm" class="text-destructive">Revoke</Button>
				</form>
			</div>

			<div class="mt-4 flex flex-col gap-3">
				{#each device.libraries as lib (lib.id)}
					<div
						class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/40 px-4 py-3"
					>
						<div class="min-w-0">
							<p class="text-sm font-medium">
								{lib.name}
								<span
									class="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground"
								>
									{lib.kind}
								</span>
							</p>
							<p class="truncate font-mono text-xs text-muted-foreground">{lib.rootPath}</p>
						</div>
						<div class="flex items-center gap-3">
							<span class="text-xs text-muted-foreground">
								{lib.files} files · scanned {formatWhen(lib.lastScanAt)}
							</span>
							<form
								method="POST"
								action="?/rescan"
								use:enhance={() =>
									async ({ update }) => {
										await update();
										setTimeout(() => invalidateAll(), 2000);
									}}
							>
								<input type="hidden" name="libraryId" value={lib.id} />
								<Button type="submit" variant="secondary" size="sm" disabled={!device.online}>
									Rescan
								</Button>
							</form>
							<form
								method="POST"
								action="?/removeLibrary"
								use:enhance
								onsubmit={(e) => {
									if (!confirm(`Remove library "${lib.name}"? Its files leave the catalog.`)) {
										e.preventDefault();
									}
								}}
							>
								<input type="hidden" name="libraryId" value={lib.id} />
								<Button type="submit" variant="ghost" size="sm" class="text-destructive">
									Remove
								</Button>
							</form>
						</div>
					</div>
				{/each}

				<form
					method="POST"
					action="?/addLibrary"
					class="flex flex-wrap items-center gap-2"
					use:enhance
				>
					<input type="hidden" name="gatewayId" value={device.id} />
					<Input name="rootPath" placeholder="/path/to/media" class="max-w-60 font-mono text-xs" />
					<Input name="name" placeholder="Library name" class="max-w-40" />
					<select
						name="kind"
						class="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
					>
						<option value="movie">Movies</option>
						<option value="series">Series</option>
					</select>
					<Button type="submit" variant="secondary" size="sm" disabled={!device.online}>
						Add library
					</Button>
				</form>
			</div>
		</section>
	{/each}

	{#if form && 'message' in form && form.message}
		<p class="text-sm text-destructive">{form.message}</p>
	{/if}
</main>
