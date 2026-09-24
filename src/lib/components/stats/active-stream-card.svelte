<script lang="ts">
	import { enhance } from '$app/forms';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { StopCircleIcon } from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import {
		audioCodecLabel,
		channelLabel,
		formatBitrate,
		formatBytes,
		videoCodecLabel
	} from '$lib/data/media-format';
	import { resolutionLabel } from '$lib/playback-quality';
	import { formatRelative } from '$lib/data/time';
	import type { ActiveStream } from '$lib/data/stats';
	import PlatformLabel from './platform-label.svelte';
	import PosterThumb from './poster-thumb.svelte';
	import TitleLink from './title-link.svelte';
	import StreamStateBadge from './stream-state-badge.svelte';
	import UserCell from './user-cell.svelte';

	/**
	 * One live stream in the activity monitor. `now`/`fetchedAt` let a playing
	 * stream's position advance between polls (heartbeats arrive every 10 s).
	 */
	let { stream, fetchedAt, now }: { stream: ActiveStream; fetchedAt: number; now: number } =
		$props();

	const position = $derived.by(() => {
		const drift = stream.state === 'playing' ? Math.max(0, now - fetchedAt) / 1000 : 0;
		const p = stream.positionSeconds + drift;
		return stream.durationSeconds ? Math.min(p, stream.durationSeconds) : p;
	});
	const fraction = $derived(stream.durationSeconds ? position / stream.durationSeconds : 0);

	function clock(seconds: number): string {
		const s = Math.max(0, Math.floor(seconds));
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = String(s % 60).padStart(2, '0');
		return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
	}

	function resolution(width: number | null): string {
		if (!width) return 'Unknown';
		const label = resolutionLabel(width);
		return label === '2160p' ? '4K' : label;
	}

	const streamLine = $derived.by(() => {
		if (stream.mode === 'direct') return 'Direct play';
		const output = resolution(stream.streamWidth);
		// The rung is only worth naming when it isn't what the output came to.
		const cap =
			stream.quality !== 'original' && stream.quality !== output ? ` (${stream.quality} cap)` : '';
		return `Transcode → ${output} H.264${cap}`;
	});
	const videoLine = $derived(
		`${resolution(stream.source.width)} ${videoCodecLabel(stream.source.videoCodec)} · ${stream.source.container.toUpperCase()}${stream.source.bitrate ? ` · ${formatBitrate(stream.source.bitrate)}` : ''}`
	);
	const audioLine = $derived.by(() => {
		const source =
			stream.audioLabel ??
			(stream.source.audioCodec ? audioCodecLabel(stream.source.audioCodec) : 'None');
		if (stream.mode !== 'hls' || !stream.audioChannels) return source;
		return `${source} → AAC ${channelLabel(stream.audioChannels) ?? ''}`.trim();
	});
</script>

<Card.Root size="sm" class="relative">
	<Card.Content class="flex gap-4">
		<PosterThumb src={stream.title.posterUrl} class="w-20 sm:w-24" />
		<div class="flex min-w-0 flex-1 flex-col gap-3">
			<div class="flex items-start justify-between gap-3">
				<div class="flex min-w-0 flex-col gap-1.5">
					<TitleLink title={stream.title} />
					<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
						<UserCell user={stream.user} />
						<span class="text-muted-foreground"><PlatformLabel platform={stream.platform} /></span>
					</div>
				</div>
				<StreamStateBadge state={stream.state} terminating={stream.terminating} />
			</div>

			<div class="flex flex-col gap-1">
				<div
					class="h-1.5 w-full overflow-hidden rounded-full bg-foreground/15"
					role="progressbar"
					aria-label="Position"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={Math.round(fraction * 100)}
				>
					<div class="h-full rounded-full bg-primary" style:width="{fraction * 100}%"></div>
				</div>
				<div class="flex justify-between text-xs text-muted-foreground tabular-nums">
					<span>{clock(position)}</span>
					<span>{stream.durationSeconds ? clock(stream.durationSeconds) : '—'}</span>
				</div>
			</div>

			<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
				<dt class="text-muted-foreground">Stream</dt>
				<dd class="truncate">{streamLine}</dd>
				<dt class="text-muted-foreground">Video</dt>
				<dd class="truncate">{videoLine}</dd>
				<dt class="text-muted-foreground">Audio</dt>
				<dd class="truncate">{audioLine}</dd>
				<dt class="text-muted-foreground">Subtitles</dt>
				<dd class="truncate">{stream.subtitleLabel ?? 'Off'}</dd>
				<dt class="text-muted-foreground">Device</dt>
				<dd class="truncate">{stream.device.name}</dd>
				<dt class="text-muted-foreground">Bandwidth</dt>
				<dd class="truncate tabular-nums">
					{formatBitrate(stream.bitrateBps)} · {formatBytes(stream.bytesSent)} sent
				</dd>
				<dt class="text-muted-foreground">Started</dt>
				<dd class="truncate">{formatRelative(stream.startedAt, now)}</dd>
			</dl>

			<form method="POST" action="?/terminate" use:enhance class="flex justify-end">
				<input type="hidden" name="sessionId" value={stream.sessionId} />
				<Button type="submit" variant="outline" size="sm" disabled={stream.terminating}>
					<HugeiconsIcon icon={StopCircleIcon} data-icon="inline-start" />
					{stream.terminating ? 'Stopping…' : 'Stop stream'}
				</Button>
			</form>
		</div>
	</Card.Content>
</Card.Root>
