<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { LANGUAGES } from '@finderella/protocol/languages';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { AlertCircleIcon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
	import PasswordInput from '$lib/components/password-input.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Progress } from '$lib/components/ui/progress';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import * as Table from '$lib/components/ui/table';
	import { formatRelative } from '$lib/data/time';

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
	const jobStats = $derived(
		[
			{ label: 'Processed', value: `${job.processed} / ${job.total}` },
			{ label: 'Downloaded', value: String(job.downloaded) },
			{ label: 'Not found', value: String(job.notFound) },
			{ label: 'Failed', value: String(job.failed), tone: job.failed > 0 },
			{ label: 'Device offline', value: String(job.skippedOffline) },
			job.quota.opensubtitlesRemaining !== null
				? { label: 'OpenSubtitles quota', value: String(job.quota.opensubtitlesRemaining) }
				: null
		].filter((s) => s !== null)
	);
	const scopeLabel: Record<string, string> = {
		all: 'Movies and series',
		movies: 'Movies only',
		series: 'Series only'
	};

	const providers = $derived([
		{
			id: 'opensubtitles',
			name: 'OpenSubtitles.com',
			covers: 'Movies and TV',
			on: data.providers.opensubtitles.configured,
			onLabel: 'Configured',
			offLabel: 'Not configured'
		},
		{
			id: 'subdl',
			name: 'Subdl',
			covers: 'Movies and TV',
			on: data.providers.subdl.configured,
			onLabel: 'Configured',
			offLabel: 'Not configured'
		},
		{
			id: 'gestdown',
			name: 'Gestdown',
			covers: 'Addic7ed & SuperSubtitles · TV only',
			on: data.providers.gestdown.enabled,
			onLabel: 'Enabled',
			offLabel: 'Off'
		},
		{
			id: 'titlovi',
			name: 'Titlovi.com',
			covers: 'Balkan languages and English',
			on: data.providers.titlovi.configured,
			onLabel: 'Configured',
			offLabel: 'Not configured'
		}
	]);
	const provider = (id: string) => providers.find((p) => p.id === id)!;
</script>

<svelte:head>
	<title>Subtitles · Admin · Finderella</title>
</svelte:head>

{#snippet providerHeading(id: string)}
	{@const p = provider(id)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="font-medium">{p.name}</p>
			<p class="text-xs text-muted-foreground">{p.covers}</p>
		</div>
		<Badge variant={p.on ? 'default' : 'secondary'}>{p.on ? p.onLabel : p.offLabel}</Badge>
	</div>
{/snippet}

{#snippet clearBox(name: string, label: string)}
	<Field.Field orientation="horizontal">
		<Checkbox id={name} {name} value="on" />
		<Field.Label for={name} class="font-normal text-muted-foreground">{label}</Field.Label>
	</Field.Field>
{/snippet}

<div>
	<h1 class="text-2xl font-semibold">Subtitles</h1>
	<p class="text-sm text-muted-foreground">
		Download subtitles for titles that have none, from the providers you set up below.
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
		<form method="POST" action="?/saveProviders" class="flex flex-col gap-6" use:enhance>
			<div class="grid gap-4 md:grid-cols-2">
				<section class="flex flex-col gap-5 rounded-xl border border-border/60 p-5">
					{@render providerHeading('opensubtitles')}
					<Field.Group class="gap-5">
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
						<div class="grid gap-4 lg:grid-cols-2">
							<Field.Field>
								<Field.Label for="os-user">Username (optional)</Field.Label>
								<Input
									id="os-user"
									name="opensubtitlesUsername"
									value={data.providers.opensubtitles.username}
									autocomplete="off"
								/>
							</Field.Field>
							<Field.Field>
								<Field.Label for="os-pass">Password (optional)</Field.Label>
								<PasswordInput
									id="os-pass"
									name="opensubtitlesPassword"
									placeholder={data.providers.opensubtitles.hasPassword ? '•••••••• (saved)' : ''}
									autocomplete="new-password"
								/>
							</Field.Field>
						</div>
						<Field.Description class="-mt-2">
							Logging in raises the quota to the account's allowance (20 per day for a free account,
							more for VIP).
						</Field.Description>
						{@render clearBox('clearOpensubtitles', 'Remove the OpenSubtitles key and account')}
					</Field.Group>
				</section>

				<section class="flex flex-col gap-5 rounded-xl border border-border/60 p-5">
					{@render providerHeading('subdl')}
					<Field.Group class="gap-5">
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
						{@render clearBox('clearSubdl', 'Remove the Subdl key')}
					</Field.Group>
				</section>

				<section class="flex flex-col gap-5 rounded-xl border border-border/60 p-5">
					{@render providerHeading('gestdown')}
					<Field.Field orientation="horizontal">
						<Field.Content>
							<Field.Label for="gestdown-enabled">Enable</Field.Label>
							<Field.Description>
								Addic7ed and SuperSubtitles through the Gestdown proxy. No account needed. Keep the
								translators' credits in the files.
							</Field.Description>
						</Field.Content>
						<input
							type="hidden"
							name="gestdownEnabled"
							value={gestdownEnabled ? 'true' : 'false'}
						/>
						<Switch id="gestdown-enabled" bind:checked={gestdownEnabled} />
					</Field.Field>
				</section>

				<section class="flex flex-col gap-5 rounded-xl border border-border/60 p-5">
					{@render providerHeading('titlovi')}
					<Field.Group class="gap-5">
						<div class="grid gap-4 lg:grid-cols-2">
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
							</Field.Field>
						</div>
						<Field.Description class="-mt-2">
							Serbian (Latin and Cyrillic), Croatian, Bosnian, Slovenian, Macedonian and English. A
							free titlovi.com account with API access.
						</Field.Description>
						{@render clearBox('clearTitlovi', 'Remove the Titlovi account')}
					</Field.Group>
				</section>
			</div>

			{#if message('providers')}
				<Alert.Root variant="destructive">
					<HugeiconsIcon icon={AlertCircleIcon} />
					<Alert.Title>{message('providers')}</Alert.Title>
				</Alert.Root>
			{:else if saved('providers')}
				<Alert.Root>
					<HugeiconsIcon icon={CheckmarkCircle02Icon} class="text-primary" />
					<Alert.Title>Provider settings saved.</Alert.Title>
				</Alert.Root>
			{/if}
			{#if tests.length > 0}
				<ul class="grid gap-2 md:grid-cols-2">
					{#each tests as test (test.provider)}
						<li
							class={[
								'flex items-start gap-2 rounded-xl border px-3 py-2 text-sm',
								test.ok ? 'border-border/60' : 'border-destructive/40 text-destructive'
							]}
						>
							{#if test.ok}
								<HugeiconsIcon icon={CheckmarkCircle02Icon} class="mt-0.5 size-4 text-primary" />
							{:else}
								<HugeiconsIcon icon={AlertCircleIcon} class="mt-0.5 size-4" />
							{/if}
							<span><span class="font-medium">{test.provider}</span> · {test.message}</span>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="flex flex-wrap items-center gap-2">
				<Button type="submit">Save providers</Button>
				<Button type="submit" variant="outline" formaction="?/testProviders">
					Test connection
				</Button>
			</div>
		</form>
	</Card.Content>
	<Card.Footer class="border-t border-border/60 text-xs text-muted-foreground">
		<p>
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
	</Card.Footer>
</Card.Root>

<div class="grid items-start gap-6 lg:grid-cols-2">
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
							<Select.Trigger id="dl-languages" class="w-full">
								<span class="truncate">{languagesLabel}</span>
							</Select.Trigger>
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
							<Field.Description>
								When both exist, pick the SDH release for automatic downloads.
							</Field.Description>
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
							<Field.Description class="text-primary">Download settings saved.</Field.Description>
						{/if}
						<div>
							<Button type="submit">Save download settings</Button>
						</div>
					</Field.Field>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Bulk download -->
	<Card.Root>
		<Card.Header>
			<Card.Title>
				{job.running ? 'Downloading subtitles' : 'Bulk download'}
			</Card.Title>
			<Card.Description>
				{#if data.configuredProviders.length === 0}
					Add a provider above to download for the library.
				{:else if job.running}
					Started {formatRelative(job.startedAt!)}
					{#if job.current}· <span class="font-mono text-xs">{job.current}</span>{/if}
				{:else}
					Looks up every title that lacks one of the chosen languages and saves the best match next
					to the video. Titles searched without a result are skipped for a week.
				{/if}
			</Card.Description>
			{#if job.running}
				<Card.Action>
					<form method="POST" action="?/stopBulk" use:enhance>
						<Button type="submit" variant="outline" size="sm" disabled={job.stopRequested}>
							{job.stopRequested ? 'Stopping…' : 'Stop'}
						</Button>
					</form>
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content class="flex flex-col gap-5">
			{#if job.running || job.finishedAt}
				<div class="flex items-center gap-3">
					<Progress value={progress} class="h-2" aria-label="Download progress" />
					<span class="w-10 text-right text-xs text-muted-foreground tabular-nums">{progress}%</span
					>
				</div>
				<dl class="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{#each jobStats as stat (stat.label)}
						<div class="rounded-xl bg-muted/50 px-3 py-2">
							<dt class="text-xs text-muted-foreground">{stat.label}</dt>
							<dd
								class={[
									'font-medium tabular-nums',
									'tone' in stat && stat.tone && 'text-destructive'
								]}
							>
								{stat.value}
							</dd>
						</div>
					{/each}
				</dl>
				{#if job.finishedAt && !job.running}
					<p class="text-xs text-muted-foreground">
						Last run finished {formatRelative(job.finishedAt)}.
					</p>
				{/if}
				{#if job.disabledProviders.length > 0 || job.lastError}
					<Alert.Root variant="destructive">
						<HugeiconsIcon icon={AlertCircleIcon} />
						<Alert.Title>
							{job.disabledProviders.length > 0
								? 'Some providers were paused for this run'
								: job.lastError}
						</Alert.Title>
						{#if job.disabledProviders.length > 0}
							<Alert.Description>
								<ul>
									{#each job.disabledProviders as d (d.provider)}
										<li>{d.provider}: {d.reason}</li>
									{/each}
								</ul>
							</Alert.Description>
						{/if}
					</Alert.Root>
				{/if}
			{/if}

			<form method="POST" action="?/startBulk" use:enhance class="flex flex-wrap items-end gap-4">
				<Field.Field class="w-48">
					<Field.Label for="bulk-scope">Scope</Field.Label>
					<Select.Root type="single" name="scope" bind:value={scope}>
						<Select.Trigger id="bulk-scope" class="w-full">{scopeLabel[scope]}</Select.Trigger>
						<Select.Content>
							<Select.Item value="all" label="Movies and series" />
							<Select.Item value="movies" label="Movies only" />
							<Select.Item value="series" label="Series only" />
						</Select.Content>
					</Select.Root>
				</Field.Field>
				<Field.Field orientation="horizontal" class="h-9 w-fit items-center">
					<Checkbox id="retry-misses" name="retryMisses" value="on" />
					<Field.Label for="retry-misses" class="font-normal">Retry recent misses</Field.Label>
				</Field.Field>
				<Button
					type="submit"
					disabled={job.running || data.configuredProviders.length === 0}
					class="ml-auto"
				>
					Start download
				</Button>
			</form>
			{#if message('bulk')}
				<p class="text-sm text-destructive">{message('bulk')}</p>
			{/if}

			{#if job.recent.length > 0}
				<div
					class="max-h-64 overflow-y-auto rounded-xl border border-border/60 bg-muted/40 p-3 font-mono text-xs"
				>
					{#each job.recent as line (line.at + line.message)}
						<div
							class={line.level === 'error'
								? 'text-destructive'
								: line.level === 'warn'
									? 'text-amber-600 dark:text-amber-500'
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
</div>

<!-- History -->
<Card.Root>
	<Card.Header>
		<Card.Title>Recent activity</Card.Title>
		<Card.Description>
			{data.totals.downloaded.toLocaleString()} subtitles downloaded so far · {data.totals.notFound.toLocaleString()}
			searches without a result
		</Card.Description>
	</Card.Header>
	<Card.Content class="overflow-x-auto">
		{#if data.recent.length === 0}
			<p class="text-sm text-muted-foreground">Nothing downloaded yet.</p>
		{:else}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>When</Table.Head>
						<Table.Head>Title</Table.Head>
						<Table.Head>Language</Table.Head>
						<Table.Head>Result</Table.Head>
						<Table.Head>Release</Table.Head>
						<Table.Head>Source</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.recent as row (row.id)}
						<Table.Row>
							<Table.Cell class="whitespace-nowrap text-muted-foreground">
								<span title={new Date(row.createdAt).toLocaleString()}>
									{formatRelative(row.createdAt)}
								</span>
							</Table.Cell>
							<Table.Cell class="max-w-80 truncate font-medium" title={row.relPath}>
								{row.title}
							</Table.Cell>
							<Table.Cell>
								<Badge variant="outline" class="uppercase">{row.language}</Badge>
							</Table.Cell>
							<Table.Cell>
								{#if row.status === 'downloaded'}
									<Badge>Downloaded</Badge>
								{:else if row.status === 'not_found'}
									<Badge variant="secondary">Not found</Badge>
								{:else}
									<Badge variant="destructive">Failed</Badge>
								{/if}
							</Table.Cell>
							<Table.Cell class="max-w-96 truncate text-muted-foreground">
								{#if row.status === 'downloaded'}
									<span title={row.releaseName ?? undefined}>{row.releaseName ?? '—'}</span>
									<span class="text-xs"> · {row.provider}</span>
								{:else if row.status === 'failed'}
									<span class="text-destructive" title={row.error ?? undefined}
										>{row.error ?? 'Failed'}</span
									>
								{:else}
									—
								{/if}
							</Table.Cell>
							<Table.Cell class="text-muted-foreground capitalize">{row.source}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</Card.Content>
</Card.Root>
