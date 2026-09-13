<script lang="ts">
	import { fly } from 'svelte/transition';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Cancel01Icon, Download04Icon, Loading03Icon } from '@hugeicons/core-free-icons';
	import { LANGUAGES, languageName } from '@finderella/protocol/languages';
	import type { SubtitleTrack } from '$lib/data';
	import {
		downloadSubtitleOnline,
		searchSubtitlesOnline,
		type SubtitleSearchResponse,
		type SubtitleSearchResult,
		type SubtitleTarget
	} from '$lib/subtitles-client';

	let {
		target,
		sessionId,
		initialLanguage,
		onclose,
		ondownloaded
	}: {
		target: SubtitleTarget;
		sessionId: string;
		/** Preselected language (the viewer's preference). */
		initialLanguage: string;
		onclose: () => void;
		/** The session's refreshed track list plus the id to select. */
		ondownloaded: (tracks: SubtitleTrack[], trackId: string) => void;
	} = $props();

	const languageOptions = LANGUAGES.map(({ code, name }) => ({ code, name })).toSorted((a, b) =>
		a.name.localeCompare(b.name)
	);
	// The prop seeds the select; later changes come from the viewer, not the prop.
	// svelte-ignore state_referenced_locally
	let language = $state(initialLanguage);
	let loading = $state(false);
	let response: SubtitleSearchResponse | null = $state(null);
	let searchError: string | null = $state(null);
	let downloadingId: string | null = $state(null);
	let downloadError: string | null = $state(null);

	// Search on open and whenever the language changes; abort a stale search.
	$effect(() => {
		const lang = language;
		const controller = new AbortController();
		loading = true;
		searchError = null;
		downloadError = null;
		searchSubtitlesOnline(target, lang, controller.signal)
			.then((result) => {
				response = result;
			})
			.catch((err: Error) => {
				if (controller.signal.aborted) return;
				response = null;
				searchError = err.message;
			})
			.finally(() => {
				if (!controller.signal.aborted) loading = false;
			});
		return () => controller.abort();
	});

	async function download(result: SubtitleSearchResult) {
		downloadingId = `${result.provider}:${result.id}`;
		downloadError = null;
		try {
			const { tracks, trackId } = await downloadSubtitleOnline(sessionId, result);
			ondownloaded(tracks, trackId);
		} catch (err) {
			downloadError = (err as Error).message;
		} finally {
			downloadingId = null;
		}
	}

	const providerLabel: Record<string, string> = {
		opensubtitles: 'OpenSubtitles',
		subdl: 'Subdl',
		gestdown: 'Gestdown',
		titlovi: 'Titlovi'
	};
	const heading = $derived.by(() => {
		const q = response?.query;
		if (!q) return 'Find subtitles';
		const ep =
			q.season !== undefined && q.episode !== undefined ? ` S${q.season}E${q.episode}` : '';
		return `${q.title}${q.year ? ` (${q.year})` : ''}${ep}`;
	});
</script>

<div
	class="find-subtitles-panel"
	role="dialog"
	aria-label="Find subtitles online"
	transition:fly={{ y: 16, duration: 200 }}
>
	<div class="flex items-center justify-between gap-4">
		<div class="flex min-w-0 flex-col">
			<span class="text-lg font-semibold text-white">Find subtitles</span>
			<span class="truncate text-sm text-white/60">{heading}</span>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<label class="sr-only" for="find-subtitles-language">Language</label>
			<select
				id="find-subtitles-language"
				bind:value={language}
				class="h-9 rounded-full border border-white/15 bg-white/10 px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-primary"
			>
				{#each languageOptions as option (option.code)}
					<option value={option.code} class="bg-neutral-900">{option.name}</option>
				{/each}
			</select>
			<button
				type="button"
				aria-label="Close"
				class="flex size-9 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
				onclick={onclose}
			>
				<HugeiconsIcon icon={Cancel01Icon} class="size-5" />
			</button>
		</div>
	</div>

	{#if downloadError}
		<p class="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{downloadError}</p>
	{/if}

	{#if loading}
		<div class="flex items-center gap-3 py-6 text-sm text-white/70">
			<HugeiconsIcon icon={Loading03Icon} class="size-5 animate-spin" />
			Searching {languageName(language) ?? language} subtitles…
		</div>
	{:else if searchError}
		<p class="py-4 text-sm text-red-200">{searchError}</p>
	{:else if response}
		{#if response.errors.length > 0}
			<ul class="flex flex-col gap-1 text-xs text-amber-200/90">
				{#each response.errors as e (e.provider)}
					<li>{providerLabel[e.provider] ?? e.provider}: {e.message}</li>
				{/each}
			</ul>
		{/if}
		{#if response.candidates.length === 0}
			<p class="py-4 text-sm text-white/70">
				Nothing found in {languageName(language) ?? language}. Try another language.
			</p>
		{:else}
			<ul class="flex flex-col divide-y divide-white/10">
				{#each response.candidates as result (`${result.provider}:${result.id}`)}
					{@const key = `${result.provider}:${result.id}`}
					<li class="flex items-center gap-3 py-2">
						<div class="flex min-w-0 flex-1 flex-col gap-0.5">
							<span class="truncate text-sm text-white" title={result.releaseName}>
								{result.releaseName}
							</span>
							<span class="flex flex-wrap items-center gap-x-2 text-xs text-white/55">
								<span class="rounded bg-white/10 px-1.5 py-0.5 text-white/80">
									{providerLabel[result.provider] ?? result.provider}
								</span>
								{#if result.note}<span>{result.note}</span>{/if}
								{#if result.matchReason === 'hash'}
									<span class="text-primary">exact file match</span>
								{:else if result.matchReason === 'release'}
									<span class="text-primary/80">same release</span>
								{/if}
								{#if result.hearingImpaired}<span>SDH</span>{/if}
								{#if result.forced}<span>forced</span>{/if}
								{#if result.trusted}<span>trusted</span>{/if}
								{#if result.aiTranslated}<span>AI translated</span>{/if}
								{#if result.machineTranslated}<span>machine translated</span>{/if}
								{#if result.downloads > 0}<span>{result.downloads.toLocaleString()} downloads</span
									>{/if}
								{#if result.uploader}<span>by {result.uploader}</span>{/if}
							</span>
						</div>
						<button
							type="button"
							class="flex h-9 shrink-0 items-center gap-2 rounded-full bg-white/10 px-3 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
							disabled={downloadingId !== null}
							onclick={() => download(result)}
						>
							{#if downloadingId === key}
								<HugeiconsIcon icon={Loading03Icon} class="size-4 animate-spin" />
							{:else}
								<HugeiconsIcon icon={Download04Icon} class="size-4" />
							{/if}
							Download
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<style>
	/* Bottom sheet above the two-row control bar; same surface as the episodes panel. */
	.find-subtitles-panel {
		position: absolute;
		inset-inline: 1rem;
		bottom: 7.5rem;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-height: calc(100% - 12rem);
		overflow-y: auto;
		padding: 1rem;
		background: rgb(23 23 28 / 0.95);
		border: 1px solid rgb(255 255 255 / 0.1);
		border-radius: var(--radius-xl);
		backdrop-filter: blur(8px);
	}
	@media (min-width: 48rem) {
		.find-subtitles-panel {
			inset-inline: auto 1rem;
			width: min(40rem, calc(100% - 2rem));
		}
	}
</style>
