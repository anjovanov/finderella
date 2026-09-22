<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { InformationCircleIcon } from '@hugeicons/core-free-icons';
	import { mergeProps } from 'bits-ui';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import type { MediaFormat } from '$lib/data';
	import {
		audioDetails,
		audioName,
		formatBitrate,
		formatBytes,
		videoCodecLabel
	} from '$lib/data/media-format';

	let {
		format,
		label,
		size = 'sm'
	}: {
		format: MediaFormat;
		/** Badge text next to the info icon ("4K"); without it the trigger is the icon alone. */
		label?: string;
		size?: 'sm' | 'md';
	} = $props();

	let open = $state(false);
	let trigger = $state<HTMLElement | null>(null);
	let content = $state<HTMLElement | null>(null);

	const video = $derived(
		[
			videoCodecLabel(format.videoCodec),
			format.width && format.height ? `${format.width}×${format.height}` : null
		]
			.filter(Boolean)
			.join(' · ')
	);
	// Only the default stream (else the first — what plays without a preference)
	// keeps the tooltip small; the player's Audio menu lists them all.
	const mainAudio = $derived.by(() => {
		const index = Math.max(
			0,
			format.audio.findIndex((track) => track.isDefault)
		);
		const track = format.audio[index];
		return track ? { track, index } : null;
	});
	const file = $derived(
		[
			format.container.toUpperCase(),
			formatBytes(format.sizeBytes),
			format.bitrate ? formatBitrate(format.bitrate) : null
		]
			.filter(Boolean)
			.join(' · ')
	);

	// Tooltips only open on hover/keyboard focus, and iOS never focuses a tapped
	// button: a tap toggles it instead. The state before the tap decides, since
	// the tooltip's own pointerdown/focus handlers may have flipped it already.
	let touchOpenBefore: boolean | null = null;
	function onpointerdown(event: PointerEvent) {
		touchOpenBefore = event.pointerType === 'touch' ? open : null;
	}
	function onclick() {
		if (touchOpenBefore === null) return;
		open = !touchOpenBefore;
		touchOpenBefore = null;
	}

	// A tap elsewhere closes it (hover and blur already close it for mouse/keyboard).
	function onDocumentPointerDown(event: PointerEvent) {
		if (!open) return;
		const target = event.target as Node | null;
		if (target && (trigger?.contains(target) || content?.contains(target))) return;
		open = false;
	}
</script>

<svelte:document onpointerdowncapture={onDocumentPointerDown} />

<Tooltip.Provider delayDuration={150}>
	<Tooltip.Root bind:open disableCloseOnTriggerClick>
		<Tooltip.Trigger bind:ref={trigger}>
			{#snippet child({ props })}
				<!-- Merged, not overridden: the trigger's own handlers drive hover/focus. -->
				<button
					{...mergeProps(props, { onpointerdown, onclick })}
					type="button"
					aria-label={label ? `${label} · file details` : 'File details'}
					class={[
						'inline-flex shrink-0 items-center gap-1 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
						// The labelled trigger looks like MetaPills' outline badges.
						label
							? [
									'rounded-4xl border border-border bg-input/30 font-medium text-foreground hover:bg-muted',
									size === 'md' ? 'h-6 px-2.5 text-sm' : 'h-5 px-2 text-xs'
								]
							: 'rounded-full p-0.5 text-muted-foreground hover:text-foreground'
					]}
				>
					{#if label}{label}{/if}
					<HugeiconsIcon
						icon={InformationCircleIcon}
						class={label && size === 'md' ? 'size-4' : 'size-3.5'}
					/>
				</button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content
			bind:ref={content}
			side="bottom"
			sideOffset={6}
			class="max-w-[min(24rem,calc(100vw-2rem))] flex-col items-stretch px-3.5 py-3"
		>
			<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-left leading-snug">
				<dt class="opacity-60">Video</dt>
				<dd>{video}</dd>
				<dt class="opacity-60">Audio</dt>
				<dd>
					{#if mainAudio}
						<!-- A lone untagged stream needs no "Track 1" name (also the fallback for
						     files scanned before audio-track discovery). -->
						{#if format.audio.length > 1 || mainAudio.track.language || mainAudio.track.title?.trim()}
							<span class="font-medium">{audioName(mainAudio.track, mainAudio.index)}</span> ·
						{/if}
						{audioDetails(mainAudio.track)}
						{#if format.audio.length > 1}
							<span class="opacity-60">· +{format.audio.length - 1} more</span>
						{/if}
					{:else}
						<span class="opacity-60">None</span>
					{/if}
				</dd>
				<dt class="opacity-60">File</dt>
				<dd>{file}</dd>
			</dl>
		</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
