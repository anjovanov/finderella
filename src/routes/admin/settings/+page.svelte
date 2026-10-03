<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { AlertCircleIcon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
	import * as Alert from '$lib/components/ui/alert';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { DEFAULT_MAX_PROFILES, LIMIT_MAX, LIMIT_MIN } from '$lib/data/account-limits';
	import { DialogForm } from '$lib/dialog-form.svelte';

	let { data, form } = $props();

	let settingsForm = $state<HTMLFormElement | null>(null);
	let allowRegistration = $derived(data.settings.allowRegistration);
	let requireLogin = $derived(data.settings.requireLogin);
	let trickplayEnabled = $derived(data.settings.trickplayEnabled);
	let trickplayForm = $state<HTMLFormElement | null>(null);
	let markersEnabled = $derived(data.settings.markersEnabled);
	let markersForm = $state<HTMLFormElement | null>(null);
	let remuxEnabled = $derived(data.settings.remuxEnabled);
	let remuxForm = $state<HTMLFormElement | null>(null);

	async function submitSettings() {
		await tick(); // let the hidden inputs pick up the new switch state
		settingsForm?.requestSubmit();
	}
	let saving = $state(false);
	let savingTrickplay = $state(false);

	async function submitTrickplay() {
		await tick();
		trickplayForm?.requestSubmit();
	}
	let savingMarkers = $state(false);

	async function submitMarkers() {
		await tick();
		markersForm?.requestSubmit();
	}
	let savingRemux = $state(false);

	async function submitRemux() {
		await tick();
		remuxForm?.requestSubmit();
	}

	// Account limits: a switch per limit (off = unlimited) and the number,
	// kept while the switch is off so turning it back on restores it.
	const DEFAULT_MAX_SESSIONS = 3;
	let sessionsLimited = $derived(data.settings.maxSessionsPerAccount !== null);
	let maxSessions = $derived(data.settings.maxSessionsPerAccount ?? DEFAULT_MAX_SESSIONS);
	let profilesLimited = $derived(data.settings.maxProfilesPerAccount !== null);
	let maxProfiles = $derived(data.settings.maxProfilesPerAccount ?? DEFAULT_MAX_PROFILES);
	let savingLimits = $state(false);

	const prune = new DialogForm();
	const noOrphans = $derived(data.orphans.movies === 0 && data.orphans.series === 0);
</script>

<svelte:head>
	<title>Site settings · Finderella</title>
</svelte:head>

<div>
	<h1 class="text-2xl font-semibold">Site settings</h1>
	<p class="text-sm text-muted-foreground">Hub-wide options and catalog housekeeping.</p>
</div>

{#if form && 'message' in form && form.message}
	<Alert.Root variant="destructive">
		<HugeiconsIcon icon={AlertCircleIcon} />
		<Alert.Title>{form.message}</Alert.Title>
	</Alert.Root>
{:else if form && 'pruned' in form && form.pruned}
	<Alert.Root>
		<HugeiconsIcon icon={CheckmarkCircle02Icon} class="text-primary" />
		<Alert.Title>
			Removed {form.pruned.movies}
			{form.pruned.movies === 1 ? 'movie' : 'movies'} and {form.pruned.series} series ({form.pruned
				.episodes}
			{form.pruned.episodes === 1 ? 'episode' : 'episodes'}).
		</Alert.Title>
	</Alert.Root>
{:else if form && 'refreshing' in form && form.refreshing}
	<Alert.Root>
		<HugeiconsIcon icon={CheckmarkCircle02Icon} class="text-primary" />
		<Alert.Title>Refreshing every title in the background.</Alert.Title>
		<Alert.Description>Unmatched titles are searched on TMDB again.</Alert.Description>
	</Alert.Root>
{/if}

<!-- Accounts -->
<Card.Root>
	<Card.Header>
		<Card.Title>Access</Card.Title>
		<Card.Description>Who can use this server, and who can create an account.</Card.Description>
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
			<input type="hidden" name="requireLogin" value={requireLogin ? 'true' : 'false'} />
			<input type="hidden" name="allowRegistration" value={allowRegistration ? 'true' : 'false'} />
			<Field.Group>
				<Field.Field orientation="horizontal">
					<Field.Content>
						<Field.Label for="require-login">Require an account to access</Field.Label>
						<Field.Description>
							When on, visitors must sign in before they can see or play anything. When off, anyone
							who can reach this server can browse and watch as a guest; watch history and resume
							positions are only kept for signed-in users.
						</Field.Description>
					</Field.Content>
					<Switch
						id="require-login"
						bind:checked={requireLogin}
						disabled={saving}
						onCheckedChange={submitSettings}
					/>
				</Field.Field>
				<Field.Field orientation="horizontal">
					<Field.Content>
						<Field.Label for="allow-registration">Allow visitors to register</Field.Label>
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
						onCheckedChange={submitSettings}
					/>
				</Field.Field>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>

<!-- Account limits -->
<Card.Root>
	<Card.Header>
		<Card.Title>Account limits</Card.Title>
		<Card.Description>
			Apply to every account, administrators included. Lowering a limit never deletes anything.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			method="POST"
			action="?/updateLimits"
			use:enhance={() => {
				savingLimits = true;
				return async ({ update }) => {
					savingLimits = false;
					await update({ reset: false });
				};
			}}
		>
			<input type="hidden" name="maxSessionsEnabled" value={sessionsLimited ? 'true' : 'false'} />
			<input type="hidden" name="maxProfilesEnabled" value={profilesLimited ? 'true' : 'false'} />
			<Field.Group>
				<Field.Field orientation="horizontal">
					<Field.Content>
						<Field.Label for="limit-sessions">Limit signed-in devices per account</Field.Label>
						<Field.Description>
							Signing in on one device too many signs out the one used longest ago. An account
							already over a lower limit is brought down to it at its next sign-in. Off = unlimited.
						</Field.Description>
					</Field.Content>
					<Switch id="limit-sessions" bind:checked={sessionsLimited} disabled={savingLimits} />
				</Field.Field>
				{#if sessionsLimited}
					<Field.Field orientation="horizontal">
						<Field.Label for="max-sessions">Devices per account</Field.Label>
						<Input
							id="max-sessions"
							name="maxSessions"
							type="number"
							min={LIMIT_MIN}
							max={LIMIT_MAX}
							step={1}
							required
							class="w-24"
							bind:value={maxSessions}
						/>
					</Field.Field>
				{/if}
				<Field.Field orientation="horizontal">
					<Field.Content>
						<Field.Label for="limit-profiles">Limit profiles per account</Field.Label>
						<Field.Description>
							Accounts over a lower limit keep their profiles but can't add more. Off = unlimited.
						</Field.Description>
					</Field.Content>
					<Switch id="limit-profiles" bind:checked={profilesLimited} disabled={savingLimits} />
				</Field.Field>
				{#if profilesLimited}
					<Field.Field orientation="horizontal">
						<Field.Label for="max-profiles">Profiles per account</Field.Label>
						<Input
							id="max-profiles"
							name="maxProfiles"
							type="number"
							min={LIMIT_MIN}
							max={LIMIT_MAX}
							step={1}
							required
							class="w-24"
							bind:value={maxProfiles}
						/>
					</Field.Field>
				{/if}
				<Field.Field orientation="horizontal">
					<Button type="submit" variant="secondary" disabled={savingLimits}>Save limits</Button>
					{#if form && 'limitsError' in form}
						<Field.Error>{form.limitsError}</Field.Error>
					{:else if form && 'limitsSaved' in form}
						<Field.Description>Limits saved.</Field.Description>
					{/if}
				</Field.Field>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>

<div class="grid gap-8 lg:grid-cols-2">
	<!-- Seek-bar thumbnails -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Trickplay</Card.Title>
			<Card.Description>Scene thumbnails while hovering the player's progress bar.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			<form
				bind:this={trickplayForm}
				method="POST"
				action="?/updateTrickplay"
				use:enhance={() => {
					savingTrickplay = true;
					return async ({ update }) => {
						savingTrickplay = false;
						await update();
					};
				}}
			>
				<input type="hidden" name="trickplayEnabled" value={trickplayEnabled ? 'true' : 'false'} />
				<Field.Group>
					<Field.Field orientation="horizontal">
						<Field.Content>
							<Field.Label for="trickplay-enabled">Seek-bar thumbnails</Field.Label>
							<Field.Description>
								The device holding a file renders its thumbnails the first time the title is played
								(and for whole libraries via <span class="font-bold"
									>Generate trickplay thumbnails</span
								>
								on the Devices page), then keeps them cached. Turn this off to spare weak devices; a single
								device can also opt out with <span class="font-mono">FINDERELLA_TRICKPLAY=0</span>.
							</Field.Description>
						</Field.Content>
						<Switch
							id="trickplay-enabled"
							bind:checked={trickplayEnabled}
							disabled={savingTrickplay}
							onCheckedChange={submitTrickplay}
						/>
					</Field.Field>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Intro / credits markers -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Skip intro & credits</Card.Title>
			<Card.Description
				>Skip buttons on the player when an intro or the credits start.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			<form
				bind:this={markersForm}
				method="POST"
				action="?/updateMarkers"
				use:enhance={() => {
					savingMarkers = true;
					return async ({ update }) => {
						savingMarkers = false;
						await update();
					};
				}}
			>
				<input type="hidden" name="markersEnabled" value={markersEnabled ? 'true' : 'false'} />
				<Field.Group>
					<Field.Field orientation="horizontal">
						<Field.Content>
							<Field.Label for="markers-enabled">Detect intros & credits</Field.Label>
							<Field.Description>
								After each scan, the device holding the files compares the audio of every episode in
								a season to find the intro and closing theme they share, and looks for rolling
								credits at the end of movies. Chapters named <span class="font-mono">Intro</span> or
								<span class="font-mono">Credits</span> are used as they are. Viewers choose between
								a button and skipping automatically in their playback settings. A single device can
								opt out with <span class="font-mono">FINDERELLA_MARKERS=0</span>.
							</Field.Description>
						</Field.Content>
						<Switch
							id="markers-enabled"
							bind:checked={markersEnabled}
							disabled={savingMarkers}
							onCheckedChange={submitMarkers}
						/>
					</Field.Field>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- In-browser remux -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Browser remux</Card.Title>
			<Card.Description>Play MKVs without transcoding them on the device.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				bind:this={remuxForm}
				method="POST"
				action="?/updateRemux"
				use:enhance={() => {
					savingRemux = true;
					return async ({ update }) => {
						savingRemux = false;
						await update();
					};
				}}
			>
				<input type="hidden" name="remuxEnabled" value={remuxEnabled ? 'true' : 'false'} />
				<Field.Group>
					<Field.Field orientation="horizontal">
						<Field.Content>
							<Field.Label for="remux-enabled">Remux in the browser</Field.Label>
							<Field.Description>
								When the viewer's browser can decode a file's video but not open its container (MKV)
								or play its audio (AC-3, E-AC-3, a second audio track), the browser re-wraps the
								original file itself instead of the device transcoding it: original quality, HDR
								kept, no work for the device. AC-3 and E-AC-3 are converted to stereo in the
								browser. Anything the browser can't handle still transcodes. Turn this off to
								transcode everything that can't play directly.
							</Field.Description>
						</Field.Content>
						<Switch
							id="remux-enabled"
							bind:checked={remuxEnabled}
							disabled={savingRemux}
							onCheckedChange={submitRemux}
						/>
					</Field.Field>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>
</div>

<div class="grid gap-8 lg:grid-cols-2">
	<!-- Catalog housekeeping -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Catalog</Card.Title>
			<Card.Description>
				{#if noOrphans}
					Every title in the catalog is backed by a media file.
				{:else}
					{data.orphans.movies}
					{data.orphans.movies === 1 ? 'movie' : 'movies'} and {data.orphans.series} series have no media
					files (placeholder titles, or files from a removed library). Titles are also pruned automatically
					when a scan finishes.
				{/if}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button variant="secondary" size="sm" disabled={noOrphans} onclick={() => prune.show()}>
				Remove titles without files
			</Button>
		</Card.Content>
	</Card.Root>

	<!-- Metadata -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Metadata</Card.Title>
			<Card.Description>
				{#if !data.metadata.configured}
					Set <span class="font-mono">TMDB_API_KEY</span> in the hub's
					<span class="font-mono">.env</span> to fetch posters, synopses, genres, cast and ratings for
					scanned titles automatically.
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
		<Card.Content>
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
		</Card.Content>
		<Card.Footer>
			<p class="text-xs text-muted-foreground">
				Metadata and artwork provided by
				<a href="https://www.themoviedb.org" class="underline" rel="noreferrer" target="_blank"
					>TMDB</a
				>. This product uses the TMDB API but is not endorsed or certified by TMDB.
			</p>
		</Card.Footer>
	</Card.Root>
</div>

<!-- Remove titles without files -->
<AlertDialog.Root bind:open={prune.open}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Remove titles without files?</AlertDialog.Title>
			<AlertDialog.Description>
				{data.orphans.movies}
				{data.orphans.movies === 1 ? 'movie' : 'movies'} and {data.orphans.series} series have no media
				file on any device. They leave the catalog, and their watch progress and watchlist entries go
				with them. Nothing is deleted from your devices.
			</AlertDialog.Description>
		</AlertDialog.Header>
		{#if prune.error}<p class="text-sm text-destructive">{prune.error}</p>{/if}
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<form method="POST" action="?/pruneCatalog" use:enhance={prune.submit}>
				<Button type="submit" variant="destructive" class="w-full" disabled={prune.busy}>
					Remove titles
				</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
