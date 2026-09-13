<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { LANGUAGES } from '@finderella/protocol/languages';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import PasswordInput from '$lib/components/password-input.svelte';

	let { data, form } = $props();

	function message(section: string): string | null {
		return form && form.section === section && 'message' in form && form.message
			? form.message
			: null;
	}
	function saved(section: string): boolean {
		return !!form && form.section === section && 'saved' in form && !!form.saved;
	}
	const tests = $derived(
		form && form.section === 'providers' && 'tests' in form ? (form.tests ?? []) : []
	);

	let gestdownEnabled = $derived(data.providers.gestdown.enabled);

	// Download settings form state (switches mirror into hidden inputs).
	let languages = $derived(data.download.languages);
	let autoDownload = $derived(data.download.autoDownload);
	let preferHearingImpaired = $derived(data.download.preferHearingImpaired);
	const languageOptions = LANGUAGES.map(({ code, name }) => ({ code, name })).toSorted((a, b) =>
		a.name.localeCompare(b.name)
	);
	const languagesLabel = $derived(
		languages.length === 0
			? 'Choose languages'
			: languages
					.map((code) => languageOptions.find((o) => o.code === code)?.name ?? code)
					.join(', ')
	);

	// Live job progress: poll while a run is active, then refresh the page data once.
	let job = $derived(data.job);
	let scope = $state<'all' | 'movies' | 'series'>('all');
	onMount(() => {
		let wasRunning = job.running;
		const timer = setInterval(async () => {
			if (!job.running && !wasRunning) return;
			try {
				const res = await fetch('/admin/subtitles/status');
				if (res.ok) job = await res.json();
			} catch {
				// keep the last snapshot
			}
			if (wasRunning && !job.running) await invalidateAll();
			wasRunning = job.running;
		}, 2000);
		return () => clearInterval(timer);
	});
	const progress = $derived(job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0);
	const scopeLabel: Record<string, string> = {
		all: 'Movies and series',
		movies: 'Movies only',
		series: 'Series only'
	};
	function when(iso: string): string {
		return new Date(iso).toLocaleString();
	}
</script>

<svelte:head>
	<title>Subtitles · Admin · Finderella</title>
</svelte:head>

<div>
	<h1 class="text-2xl font-semibold">Subtitles</h1>
	<p class="text-sm text-muted-foreground">
		Download subtitles from OpenSubtitles.com and Subdl for titles that have none.
	</p>
</div>

<!-- Providers -->
<Card.Root>
	<Card.Header>
		<Card.Title>Providers</Card.Title>
		<Card.Description>
			Keys are stored on this hub and shared by everyone who downloads through it. Leave a field
			blank to keep the saved value.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/saveProviders" use:enhance>
			<Field.Group>
				<div class="grid gap-6 md:grid-cols-2">
					<div class="flex flex-col gap-4">
						<div class="flex items-center gap-2">
							<span class="font-medium">OpenSubtitles.com</span>
							<Badge variant={data.providers.opensubtitles.configured ? 'default' : 'secondary'}>
								{data.providers.opensubtitles.configured ? 'Configured' : 'Not configured'}
							</Badge>
						</div>
						<Field.Field>
							<Field.Label for="os-key">API key</Field.Label>
							<Input
								id="os-key"
								name="opensubtitlesApiKey"
								placeholder={data.providers.opensubtitles.apiKey ??
									'From your consumer at opensubtitles.com/consumers'}
								autocomplete="off"
							/>
							<Field.Description>
								One key per application: create a consumer for this hub. Without an account login
								OpenSubtitles allows 5 downloads per day per IP.
							</Field.Description>
						</Field.Field>
						<Field.Field>
							<Field.Label for="os-user">Account username (optional)</Field.Label>
							<Input
								id="os-user"
								name="opensubtitlesUsername"
								value={data.providers.opensubtitles.username}
								autocomplete="off"
							/>
						</Field.Field>
						<Field.Field>
							<Field.Label for="os-pass">Account password (optional)</Field.Label>
							<PasswordInput
								id="os-pass"
								name="opensubtitlesPassword"
								placeholder={data.providers.opensubtitles.hasPassword ? '•••••••• (saved)' : ''}
								autocomplete="new-password"
							/>
							<Field.Description>
								Logging in raises the quota to the account's allowance (20 per day for a free
								account, more for VIP).
							</Field.Description>
						</Field.Field>
						<label class="flex items-center gap-2 text-sm text-muted-foreground">
							<input type="checkbox" name="clearOpensubtitles" class="accent-primary" />
							Remove the OpenSubtitles key and account
						</label>
					</div>
					<div class="flex flex-col gap-4">
						<div class="flex items-center gap-2">
							<span class="font-medium">Subdl</span>
							<Badge variant={data.providers.subdl.configured ? 'default' : 'secondary'}>
								{data.providers.subdl.configured ? 'Configured' : 'Not configured'}
							</Badge>
						</div>
						<Field.Field>
							<Field.Label for="subdl-key">API key</Field.Label>
							<Input
								id="subdl-key"
								name="subdlApiKey"
								placeholder={data.providers.subdl.apiKey ?? 'From subdl.com/panel/api'}
								autocomplete="off"
							/>
							<Field.Description>
								Subdl's terms allow a free key for personal use; a server shared with many users
								needs their paid plan.
							</Field.Description>
						</Field.Field>
						<label class="flex items-center gap-2 text-sm text-muted-foreground">
							<input type="checkbox" name="clearSubdl" class="accent-primary" />
							Remove the Subdl key
						</label>
					</div>
					<div class="flex flex-col gap-4">
						<div class="flex items-center gap-2">
							<span class="font-medium">Gestdown (Addic7ed &amp; SuperSubtitles)</span>
							<Badge variant={data.providers.gestdown.enabled ? 'default' : 'secondary'}>
								{data.providers.gestdown.enabled ? 'Enabled' : 'Off'}
							</Badge>
						</div>
						<Field.Field orientation="horizontal">
							<Field.Content>
								<Field.Label for="gestdown-enabled">Enable</Field.Label>
								<Field.Description>
									Addic7ed and SuperSubtitles through the Gestdown proxy. TV shows only, no account
									needed. Keep the translators' credits in the files.
								</Field.Description>
							</Field.Content>
							<input
								type="hidden"
								name="gestdownEnabled"
								value={gestdownEnabled ? 'true' : 'false'}
							/>
							<Switch id="gestdown-enabled" bind:checked={gestdownEnabled} />
						</Field.Field>
					</div>
					<div class="flex flex-col gap-4">
						<div class="flex items-center gap-2">
							<span class="font-medium">Titlovi.com</span>
							<Badge variant={data.providers.titlovi.configured ? 'default' : 'secondary'}>
								{data.providers.titlovi.configured ? 'Configured' : 'Not configured'}
							</Badge>
						</div>
						<Field.Field>
							<Field.Label for="titlovi-user">Username</Field.Label>
							<Input
								id="titlovi-user"
								name="titloviUsername"
								value={data.providers.titlovi.username}
								autocomplete="off"
							/>
						</Field.Field>
						<Field.Field>
							<Field.Label for="titlovi-pass">Password</Field.Label>
							<PasswordInput
								id="titlovi-pass"
								name="titloviPassword"
								placeholder={data.providers.titlovi.hasPassword ? '•••••••• (saved)' : ''}
								autocomplete="new-password"
							/>
							<Field.Description>
								Serbian (Latin and Cyrillic), Croatian, Bosnian, Slovenian, Macedonian and English.
								A free titlovi.com account with API access.
							</Field.Description>
						</Field.Field>
						<label class="flex items-center gap-2 text-sm text-muted-foreground">
							<input type="checkbox" name="clearTitlovi" class="accent-primary" />
							Remove the Titlovi account
						</label>
					</div>
				</div>
				<Field.Field>
					{#if message('providers')}
						<Field.Error>{message('providers')}</Field.Error>
					{:else if saved('providers')}
						<Field.Description>Provider settings saved.</Field.Description>
					{/if}
					{#if tests.length > 0}
						<ul class="flex flex-col gap-1 text-sm">
							{#each tests as test (test.provider)}
								<li class={test.ok ? 'text-foreground' : 'text-destructive'}>
									{test.provider}: {test.message}
								</li>
							{/each}
						</ul>
					{/if}
				</Field.Field>
				<div class="flex flex-wrap gap-2">
					<Button type="submit" variant="secondary" class="w-fit">Save providers</Button>
					<Button type="submit" variant="outline" class="w-fit" formaction="?/testProviders">
						Test connection
					</Button>
				</div>
			</Field.Group>
		</form>
		<p class="mt-6 text-xs text-muted-foreground">
			Subtitles are provided by
			<a href="https://www.opensubtitles.com" class="underline" target="_blank" rel="noreferrer"
				>OpenSubtitles.com</a
			>,
			<a href="https://subdl.com" class="underline" target="_blank" rel="noreferrer">Subdl</a>,
			<a href="https://www.addic7ed.com" class="underline" target="_blank" rel="noreferrer"
				>Addic7ed</a
			>
			(via
			<a href="https://www.gestdown.info" class="underline" target="_blank" rel="noreferrer"
				>Gestdown</a
			>) and
			<a href="https://titlovi.com" class="underline" target="_blank" rel="noreferrer"
				>Titlovi.com</a
			>, and belong to their uploaders and translators.
		</p>
	</Card.Content>
</Card.Root>

<!-- Download settings -->
<Card.Root>
	<Card.Header>
		<Card.Title>Download settings</Card.Title>
		<Card.Description
			>Which languages bulk and automatic downloads fetch for every title.</Card.Description
		>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/saveDownloadSettings" use:enhance>
			<Field.Group>
				<Field.Field>
					<Field.Label for="dl-languages">Languages</Field.Label>
					<Select.Root type="multiple" name="languages" bind:value={languages}>
						<Select.Trigger id="dl-languages" class="w-full">{languagesLabel}</Select.Trigger>
						<Select.Content class="max-h-72">
							{#each languageOptions as option (option.code)}
								<Select.Item value={option.code} label={option.name} />
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Field>
				<Field.Field orientation="horizontal">
					<Field.Content>
						<Field.Label for="auto-download">Auto-download for new titles</Field.Label>
						<Field.Description>
							After each library scan (and its metadata pass), fetch the languages above for files
							that appeared since the last run.
						</Field.Description>
					</Field.Content>
					<input type="hidden" name="autoDownload" value={autoDownload ? 'true' : 'false'} />
					<Switch id="auto-download" bind:checked={autoDownload} />
				</Field.Field>
				<Field.Field orientation="horizontal">
					<Field.Content>
						<Field.Label for="prefer-hi">Prefer hearing-impaired (SDH) versions</Field.Label>
						<Field.Description
							>When both exist, pick the SDH release for automatic downloads.</Field.Description
						>
					</Field.Content>
					<input
						type="hidden"
						name="preferHearingImpaired"
						value={preferHearingImpaired ? 'true' : 'false'}
					/>
					<Switch id="prefer-hi" bind:checked={preferHearingImpaired} />
				</Field.Field>
				<Field.Field>
					{#if message('download')}
						<Field.Error>{message('download')}</Field.Error>
					{:else if saved('download')}
						<Field.Description>Download settings saved.</Field.Description>
					{/if}
					<Button type="submit" variant="secondary" class="w-fit">Save download settings</Button>
				</Field.Field>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>

<!-- Bulk download -->
<Card.Root>
	<Card.Header>
		<Card.Title>Bulk download</Card.Title>
		<Card.Description>
			{#if data.configuredProviders.length === 0}
				Add a provider above to download for the library.
			{:else if job.running}
				Running since {when(job.startedAt!)} · {job.processed} of {job.total}
				{#if job.current}· {job.current}{/if}
			{:else}
				Looks up every title that lacks one of the chosen languages and saves the best match next to
				the video. Titles searched without a result are skipped for a week.
			{/if}
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		{#if job.running || job.finishedAt}
			<div class="flex flex-col gap-2">
				<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
					<div class="h-full bg-primary transition-[width]" style="width: {progress}%"></div>
				</div>
				<div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
					<span>{job.downloaded} downloaded</span>
					<span>{job.notFound} not found</span>
					<span>{job.failed} failed</span>
					<span>{job.skippedOffline} skipped (device offline)</span>
					{#if job.quota.opensubtitlesRemaining !== null}
						<span>OpenSubtitles quota left: {job.quota.opensubtitlesRemaining}</span>
					{/if}
				</div>
				{#if job.disabledProviders.length > 0}
					<ul class="text-sm text-destructive">
						{#each job.disabledProviders as d (d.provider)}
							<li>{d.provider}: {d.reason}</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
		<div class="flex flex-wrap items-end gap-3">
			<form method="POST" action="?/startBulk" use:enhance class="flex flex-wrap items-end gap-3">
				<Field.Field>
					<Field.Label for="bulk-scope">Scope</Field.Label>
					<Select.Root type="single" name="scope" bind:value={scope}>
						<Select.Trigger id="bulk-scope" class="w-48">{scopeLabel[scope]}</Select.Trigger>
						<Select.Content>
							<Select.Item value="all" label="Movies and series" />
							<Select.Item value="movies" label="Movies only" />
							<Select.Item value="series" label="Series only" />
						</Select.Content>
					</Select.Root>
				</Field.Field>
				<label class="flex h-9 items-center gap-2 text-sm text-muted-foreground">
					<input type="checkbox" name="retryMisses" class="accent-primary" />
					Retry recent misses
				</label>
				<Button
					type="submit"
					variant="secondary"
					disabled={job.running || data.configuredProviders.length === 0}
				>
					Start
				</Button>
			</form>
			{#if job.running}
				<form method="POST" action="?/stopBulk" use:enhance>
					<Button type="submit" variant="outline" disabled={job.stopRequested}>
						{job.stopRequested ? 'Stopping…' : 'Stop'}
					</Button>
				</form>
			{/if}
		</div>
		{#if message('bulk')}
			<p class="text-sm text-destructive">{message('bulk')}</p>
		{/if}
		{#if job.recent.length > 0}
			<div class="max-h-64 overflow-y-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs">
				{#each job.recent as line (line.at + line.message)}
					<div
						class={line.level === 'error'
							? 'text-destructive'
							: line.level === 'warn'
								? 'text-amber-500'
								: ''}
					>
						<span class="text-muted-foreground">{new Date(line.at).toLocaleTimeString()}</span>
						{line.message}
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>

<!-- History -->
<Card.Root>
	<Card.Header>
		<Card.Title>Recent activity</Card.Title>
		<Card.Description>
			{data.totals.downloaded} subtitles downloaded so far · {data.totals.notFound} searches without a
			result.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if data.recent.length === 0}
			<p class="text-sm text-muted-foreground">Nothing downloaded yet.</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="text-left text-xs text-muted-foreground">
						<tr>
							<th class="py-1 pr-3 font-medium">When</th>
							<th class="py-1 pr-3 font-medium">Title</th>
							<th class="py-1 pr-3 font-medium">Language</th>
							<th class="py-1 pr-3 font-medium">Result</th>
							<th class="py-1 font-medium">Source</th>
						</tr>
					</thead>
					<tbody>
						{#each data.recent as row (row.id)}
							<tr class="border-t">
								<td class="py-1.5 pr-3 whitespace-nowrap text-muted-foreground"
									>{when(row.createdAt)}</td
								>
								<td class="max-w-64 truncate py-1.5 pr-3" title={row.relPath}>{row.title}</td>
								<td class="py-1.5 pr-3 uppercase">{row.language}</td>
								<td class="py-1.5 pr-3">
									{#if row.status === 'downloaded'}
										<span class="text-foreground">{row.releaseName ?? 'downloaded'}</span>
										<span class="text-muted-foreground"> · {row.provider}</span>
									{:else if row.status === 'not_found'}
										<span class="text-muted-foreground">not found</span>
									{:else}
										<span class="text-destructive">{row.error ?? 'failed'}</span>
									{/if}
								</td>
								<td class="py-1.5 text-muted-foreground">{row.source}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
