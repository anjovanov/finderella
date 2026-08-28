<script lang="ts">
	import '@videojs/html/video/ui';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		ArrowLeft01Icon,
		ArrowRight01Icon,
		CastIcon,
		GoBackward10SecIcon,
		GoForward10SecIcon,
		Loading03Icon,
		Maximize01Icon,
		Minimize01Icon,
		PauseIcon,
		PlayIcon,
		PlayListIcon,
		Settings02Icon,
		SubtitleIcon,
		Tick02Icon,
		VolumeHighIcon,
		VolumeLowIcon,
		VolumeOffIcon
	} from '@hugeicons/core-free-icons';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import type { Series, SubtitleTrack } from '$lib/data';
	import {
		availableQualities,
		MAX_TRANSCODE_WIDTH,
		resolutionLabel,
		type QualityId
	} from '$lib/playback-quality';
	import EpisodesPanel from './episodes-panel.svelte';

	let {
		title,
		subtitle,
		backHref,
		videoSrc,
		videoKind = 'file',
		startAt = 0,
		onProgress,
		onError,
		tracks = [],
		quality = 'original',
		sourceWidth = null,
		onQualityChange,
		nextHref,
		show,
		currentEpisodeId
	}: {
		title: string;
		/** Secondary line, e.g. "S1 E2 · The Tidewalker" for series episodes. */
		subtitle?: string;
		backHref: string;
		videoSrc: string;
		/** 'file' = progressive src; 'hls' = m3u8 via hls.js (native on Safari). */
		videoKind?: 'file' | 'hls';
		/** Resume position in seconds, applied when the source loads. */
		startAt?: number;
		/** Playback position reports (every timeupdate, ~4 Hz — throttle upstream). */
		onProgress?: (positionSeconds: number, durationSeconds: number) => void;
		/**
		 * Unrecoverable playback failure (codec the browser can't decode, the
		 * device's transcoder erroring, the file failing to load). Without this
		 * the player would just buffer forever.
		 */
		onError?: (message: string) => void;
		tracks?: SubtitleTrack[];
		/** Current ladder rung; the quality menu only renders when `onQualityChange` is given. */
		quality?: QualityId;
		/** Probed width of the source file; hides rungs above it and labels Auto. */
		sourceWidth?: number | null;
		/** Viewer picked a rung — the page restarts the session at the current position. */
		onQualityChange?: (quality: QualityId) => void;
		nextHref?: string;
		/** When set (with `currentEpisodeId`), shows the "More episodes" control — series only. */
		show?: Series;
		currentEpisodeId?: string;
	} = $props();

	// The page under this fixed overlay is taller than the viewport (header + min-h-svh
	// main); lock scrolling while the player is open.
	$effect(() => {
		const root = document.documentElement;
		const previous = root.style.overflow;
		root.style.overflow = 'hidden';
		return () => {
			root.style.overflow = previous;
		};
	});

	// The controls feature toggles `data-visible` on <media-controls> (activity/idle);
	// mirror it onto our top bar so both fade in sync.
	let barVisible = $state(true);
	let videoEl: HTMLVideoElement | undefined = $state();

	// Autoplay the next episode when the current one ends (series only). On by
	// default; persisted per browser. Watch pages are ssr = false, but guard anyway.
	const AUTOPLAY_KEY = 'finderella:autoplay-next';
	let autoplayNext = $state(true);
	try {
		autoplayNext = localStorage.getItem(AUTOPLAY_KEY) !== '0';
	} catch {
		// localStorage unavailable (SSR or blocked) — default on.
	}

	function toggleAutoplayNext() {
		autoplayNext = !autoplayNext;
		try {
			localStorage.setItem(AUTOPLAY_KEY, autoplayNext ? '1' : '0');
		} catch {
			// Preference just won't persist.
		}
	}

	// "Next episode starting in…" countdown, shown during the last 10 seconds
	// when autoplay-next will actually fire. Driven by timeupdate (~4 Hz).
	let remainingSeconds: number | null = $state(null);

	function onTimeUpdate() {
		if (!videoEl || !Number.isFinite(videoEl.duration)) {
			remainingSeconds = null;
			return;
		}
		remainingSeconds = videoEl.duration - videoEl.currentTime;
		onProgress?.(videoEl.currentTime, videoEl.duration);
	}

	const nextCountdown = $derived(
		autoplayNext &&
			nextHref &&
			remainingSeconds !== null &&
			remainingSeconds > 0 &&
			remainingSeconds <= 10
			? Math.ceil(remainingSeconds)
			: null
	);

	// Attach the source and start playback whenever the player mounts or is
	// re-sourced — arriving from a Play button, switching episodes, or
	// autoplay-next. HLS goes through hls.js (MSE drives the same native
	// element the custom controls already target). hls.js is used wherever MSE
	// exists; the browser's native HLS only where it doesn't (Safari/iOS). Edge
	// advertises native HLS in canPlayType but can't parse our fMP4 playlists.
	// A cold page load may be blocked by the browser's autoplay policy (no
	// user gesture on the document yet); the promise rejects and the user
	// presses play.
	$effect(() => {
		const el = videoEl;
		const src = videoSrc;
		const kind = videoKind;
		if (!el) return;

		const resumeAt = startAt > 0 ? startAt : null;

		const applyResume = () => {
			if (resumeAt !== null) el.currentTime = resumeAt;
		};
		const onMediaError = () => {
			onError?.(
				el.error?.message
					? `The browser could not play this file (${el.error.message}).`
					: 'The browser could not play this file.'
			);
		};
		const playNative = () => {
			el.src = src;
			el.addEventListener('loadedmetadata', applyResume, { once: true });
			el.addEventListener('error', onMediaError);
			el.play().catch(() => {});
		};
		const stopNative = () => {
			el.removeEventListener('loadedmetadata', applyResume);
			el.removeEventListener('error', onMediaError);
		};

		if (kind === 'hls') {
			let cancelled = false;
			let hls: InstanceType<(typeof import('hls.js'))['default']> | null = null;
			void import('hls.js').then(({ default: Hls }) => {
				if (cancelled) return;
				if (!Hls.isSupported()) {
					if (el.canPlayType('application/vnd.apple.mpegurl')) playNative();
					else onError?.('This browser cannot play HLS streams.');
					return;
				}
				hls = new Hls(resumeAt !== null ? { startPosition: resumeAt } : {});
				hls.loadSource(src);
				hls.attachMedia(el);
				hls.on(Hls.Events.MANIFEST_PARSED, () => el.play().catch(() => {}));
				// hls.js never recovers from a fatal error on its own; one media
				// recovery attempt, then hand the reason to the page.
				let recovered = false;
				hls.on(Hls.Events.ERROR, (_event, data) => {
					if (!data.fatal || cancelled) return;
					if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
						recovered = true;
						hls?.recoverMediaError();
						return;
					}
					onError?.(describeHlsError(data.details, data.response?.code, data.error?.message));
				});
			});
			return () => {
				cancelled = true;
				hls?.destroy();
				stopNative();
				el.removeAttribute('src');
				el.load();
			};
		}

		playNative();
		return stopNative;
	});

	/** Turn an hls.js fatal error into something a viewer (and the hub log reader) can act on. */
	function describeHlsError(details: string, httpStatus?: number, reason?: string): string {
		switch (details) {
			case 'bufferAddCodecError':
			case 'bufferIncompatibleCodecsError':
				return 'This browser cannot decode the transcoded stream (unsupported codec profile).';
			case 'manifestLoadError':
			case 'manifestLoadTimeOut':
			case 'levelLoadError':
			case 'levelLoadTimeOut':
				return `The playlist could not be loaded${httpStatus ? ` (HTTP ${httpStatus})` : ''}.`;
			case 'fragLoadError':
			case 'fragLoadTimeOut':
				return `The device's transcoder stopped delivering video${
					httpStatus ? ` (HTTP ${httpStatus})` : ''
				}; check the hub log for the ffmpeg error.`;
			case 'fragParsingError':
				return 'The transcoded segment was malformed; check the hub log for the ffmpeg error.';
			case 'bufferStalledError':
				return 'Playback stalled and could not resume.';
			default:
				return `Playback failed: ${details}${reason ? ` (${reason})` : ''}.`;
		}
	}

	// Same-route navigation reuses this component instance; the effect above
	// starts playback once the new episode's source is in.
	function onVideoEnded() {
		if (!autoplayNext || !nextHref) return;
		/* eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass resolve()d paths */
		goto(nextHref).catch(() => {});
	}

	// Episodes panel (series only). While open, player chrome is pinned visible
	// even when the library marks the controls idle.
	let episodesOpen = $state(false);
	let qualityOpen = $state(false);
	const menuOpen = $derived(episodesOpen || qualityOpen);
	const qualityOptions = $derived(availableQualities(sourceWidth));
	// What "Original" resolves to for this file: the source itself when direct-playing,
	// else the transcoder's output (source capped at the 4K ceiling).
	const autoDescription = $derived.by(() => {
		const delivery = videoKind === 'hls' ? 'transcoded' : 'direct play';
		if (!sourceWidth) return delivery;
		const width = videoKind === 'hls' ? Math.min(sourceWidth, MAX_TRANSCODE_WIDTH) : sourceWidth;
		return `${resolutionLabel(width)} · ${delivery}`;
	});
	const chromeVisible = $derived(barVisible || menuOpen);

	// Close on any pointerdown outside the open surface and its trigger.
	$effect(() => {
		if (!menuOpen) return;
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Element | null;
			if (!target?.closest('.episodes-panel, .episodes-trigger')) episodesOpen = false;
			if (!target?.closest('.quality-menu, .quality-trigger')) qualityOpen = false;
		};
		document.addEventListener('pointerdown', onPointerDown, true);
		return () => document.removeEventListener('pointerdown', onPointerDown, true);
	});

	// Seek against the media element directly — media-seek-button reads the store's
	// currentTime snapshot, which is stale (0) in this beta and seeks to the wrong spot.
	function seekBy(seconds: number) {
		if (!videoEl) return;
		const max = Number.isFinite(videoEl.duration) ? videoEl.duration : Infinity;
		videoEl.currentTime = Math.min(max, Math.max(0, videoEl.currentTime + seconds));
	}

	// Keyboard shortcuts: space = play/pause, arrows = seek 10s. Skipped while an
	// interactive control has focus so native key handling (button activation,
	// slider arrows) isn't doubled up.
	function onkeydown(event: KeyboardEvent) {
		// Escape closes the episodes panel even while one of its controls has focus.
		// (In fullscreen the browser may consume Escape to exit fullscreen first.)
		if (event.key === 'Escape' && menuOpen) {
			episodesOpen = false;
			qualityOpen = false;
			return;
		}
		const target = event.target as HTMLElement | null;
		if (
			target?.closest(
				'button, a, input, select, textarea, [role="button"], [role="slider"], [role="menuitemradio"], [contenteditable="true"]'
			)
		) {
			return;
		}
		if (event.code === 'Space') {
			event.preventDefault();
			if (!videoEl) return;
			if (videoEl.paused) videoEl.play().catch(() => {});
			else videoEl.pause();
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			seekBy(-10);
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			seekBy(10);
		}
	}

	function syncTopBar(node: HTMLElement) {
		const update = () => (barVisible = node.hasAttribute('data-visible'));
		update();
		const observer = new MutationObserver(update);
		observer.observe(node, { attributes: true, attributeFilter: ['data-visible'] });
		return () => observer.disconnect();
	}

	// Fullscreen the media-container itself — the element the library expects to be
	// fullscreened (the packaged skin does the same). Our top bar and controls live
	// inside it, so everything stays visible in fullscreen.
	let containerEl: HTMLElement | undefined = $state();
	let isFullscreen = $state(false);

	function toggleFullscreen() {
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => {});
		} else {
			containerEl?.requestFullscreen().catch(() => {});
		}
	}
</script>

<svelte:window {onkeydown} />
<svelte:document onfullscreenchange={() => (isFullscreen = !!document.fullscreenElement)} />

<div
	class={[
		'player-root fixed inset-0 z-50 flex flex-col bg-black',
		!chromeVisible && 'cursor-none',
		menuOpen && 'menu-open'
	]}
>
	<div class="min-h-0 flex-1">
		<video-player>
			<media-container bind:this={containerEl}>
				<!-- src is attached programmatically (file/HLS) by the source effect. -->
				<video
					bind:this={videoEl}
					slot="media"
					playsinline
					preload="metadata"
					onended={onVideoEnded}
					ontimeupdate={onTimeUpdate}
					onloadstart={() => (remainingSeconds = null)}
				>
					{#each tracks as track (track.srclang)}
						<track kind={track.kind} src={track.src} srclang={track.srclang} label={track.label} />
					{/each}
				</video>

				<!-- Inside media-container so hovering it counts as player activity (keeps
				     controls visible; also shows in fullscreen). -->
				<div
					class={[
						'absolute inset-x-0 top-0 z-10 flex items-center gap-4 bg-linear-to-b from-black/80 to-transparent px-4 pt-4 pb-10 transition-opacity duration-300 sm:px-6',
						!chromeVisible && 'pointer-events-none opacity-0'
					]}
				>
					<!-- callers pass resolve()d paths -->
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						href={backHref}
						aria-label="Back"
						class="flex size-10 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
					>
						<HugeiconsIcon icon={ArrowLeft01Icon} class="size-6" />
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
					<div class="flex min-w-0 flex-col">
						<span class="truncate text-lg font-semibold text-white">{title}</span>
						{#if subtitle}
							<span class="truncate text-sm text-white/70">{subtitle}</span>
						{/if}
					</div>
					{#if nextHref}
						<Button
							href={nextHref}
							variant="secondary"
							size="sm"
							class="ml-auto bg-white/15 text-white backdrop-blur hover:bg-white/25"
						>
							Next episode
							<HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" />
						</Button>
					{/if}
				</div>

				<media-buffering-indicator class="buffering">
					<HugeiconsIcon icon={Loading03Icon} class="size-12 animate-spin text-white" />
				</media-buffering-indicator>

				<media-controls class="controls" {@attach syncTopBar}>
					<media-controls-group class="controls-row">
						<media-time-slider class="time-slider">
							<media-slider-track class="slider-track">
								<media-slider-buffer class="slider-buffer"></media-slider-buffer>
								<media-slider-fill class="slider-fill"></media-slider-fill>
							</media-slider-track>
							<media-slider-thumb class="slider-thumb"></media-slider-thumb>
							<media-slider-preview class="slider-preview">
								<media-slider-value type="pointer"></media-slider-value>
							</media-slider-preview>
						</media-time-slider>
					</media-controls-group>

					<media-controls-group class="controls-row controls-bottom">
						<div class="left-cluster">
							<media-time-group class="time-display">
								<media-time type="current"></media-time>
								<media-time-separator>/</media-time-separator>
								<media-time type="duration"></media-time>
							</media-time-group>
							{#if show && currentEpisodeId}
								<button
									type="button"
									class="ctrl-button episodes-trigger"
									aria-label="More episodes"
									aria-expanded={episodesOpen}
									onclick={() => (episodesOpen = !episodesOpen)}
								>
									<HugeiconsIcon icon={PlayListIcon} class="size-6" />
									<span class="text-sm font-medium">More Episodes</span>
								</button>
							{/if}
						</div>

						<div class="center-cluster">
							<button
								type="button"
								class="ctrl-button"
								aria-label="Rewind 10 seconds"
								onclick={() => seekBy(-10)}
							>
								<HugeiconsIcon icon={GoBackward10SecIcon} class="size-6" />
							</button>
							<media-play-button class="ctrl-button play-button" aria-label="Play or pause">
								<span class="icon icon-play"><HugeiconsIcon icon={PlayIcon} class="size-8" /></span>
								<span class="icon icon-pause"
									><HugeiconsIcon icon={PauseIcon} class="size-8" /></span
								>
							</media-play-button>
							<button
								type="button"
								class="ctrl-button"
								aria-label="Forward 10 seconds"
								onclick={() => seekBy(10)}
							>
								<HugeiconsIcon icon={GoForward10SecIcon} class="size-6" />
							</button>
						</div>

						<div class="right-cluster">
							{#if show}
								<button
									type="button"
									class="ctrl-button autoplay-toggle"
									role="switch"
									aria-checked={autoplayNext}
									aria-label="Autoplay next episode"
									onclick={toggleAutoplayNext}
								>
									<span class="text-sm font-medium">Autoplay</span>
									<!-- Switch visual; state is carried by aria-checked on the button. -->
									<span
										class={[
											'flex h-4.5 w-8 items-center rounded-full px-0.5 transition-colors',
											autoplayNext ? 'bg-primary' : 'bg-white/25'
										]}
									>
										<span
											class={[
												'size-3.5 rounded-full bg-white shadow transition-transform',
												autoplayNext && 'translate-x-3.5'
											]}
										></span>
									</span>
								</button>
							{/if}

							<div class="volume-group">
								<media-mute-button class="ctrl-button" aria-label="Mute or unmute">
									<span class="icon icon-vol-high">
										<HugeiconsIcon icon={VolumeHighIcon} class="size-6" />
									</span>
									<span class="icon icon-vol-low">
										<HugeiconsIcon icon={VolumeLowIcon} class="size-6" />
									</span>
									<span class="icon icon-vol-off">
										<HugeiconsIcon icon={VolumeOffIcon} class="size-6" />
									</span>
								</media-mute-button>
								<media-volume-slider class="volume-slider">
									<media-slider-track class="slider-track">
										<media-slider-fill class="slider-fill"></media-slider-fill>
									</media-slider-track>
									<media-slider-thumb class="slider-thumb"></media-slider-thumb>
								</media-volume-slider>
							</div>

							{#if onQualityChange}
								<button
									type="button"
									class="ctrl-button quality-trigger"
									aria-haspopup="menu"
									aria-expanded={qualityOpen}
									aria-label="Video quality"
									onclick={() => (qualityOpen = !qualityOpen)}
								>
									<HugeiconsIcon icon={Settings02Icon} class="size-6" />
								</button>
							{/if}

							<media-cast-button class="ctrl-button" aria-label="Cast">
								<HugeiconsIcon icon={CastIcon} class="size-6" />
							</media-cast-button>

							{#if tracks.length > 0}
								<media-captions-button
									class="ctrl-button"
									menu-for="captions-menu"
									aria-label="Subtitles"
								>
									<HugeiconsIcon icon={SubtitleIcon} class="size-6" />
								</media-captions-button>
							{/if}

							<button
								type="button"
								class="ctrl-button"
								aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
								onclick={toggleFullscreen}
							>
								{#if isFullscreen}
									<HugeiconsIcon icon={Minimize01Icon} class="size-6" />
								{:else}
									<HugeiconsIcon icon={Maximize01Icon} class="size-6" />
								{/if}
							</button>
						</div>
					</media-controls-group>
				</media-controls>

				{#if nextCountdown !== null}
					<div
						class="pointer-events-none absolute right-4 bottom-28 z-10 rounded-lg bg-black/70 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm sm:right-6"
					>
						Next episode starting in <span class="tabular-nums">{nextCountdown}</span>
					</div>
				{/if}

				{#if episodesOpen && show && currentEpisodeId}
					<EpisodesPanel {show} {currentEpisodeId} onclose={() => (episodesOpen = false)} />
				{/if}

				{#if qualityOpen && onQualityChange}
					<div class="quality-menu captions-menu" role="menu" aria-label="Video quality">
						{#each qualityOptions as option (option.id)}
							<button
								type="button"
								role="menuitemradio"
								aria-checked={option.id === quality}
								class="menu-item w-full"
								onclick={() => {
									qualityOpen = false;
									onQualityChange(option.id);
								}}
							>
								<span>
									{option.label}
									{#if option.id === 'original'}
										<span class="text-white/50">· {autoDescription}</span>
									{/if}
								</span>
								{#if option.id === quality}
									<HugeiconsIcon icon={Tick02Icon} class="size-4 text-primary" />
								{/if}
							</button>
						{/each}
					</div>
				{/if}

				{#if tracks.length > 0}
					<media-menu id="captions-menu" class="captions-menu">
						<media-captions-radio-group>
							<template>
								<media-menu-radio-item class="menu-item">
									<span data-part="label"></span>
									<media-menu-item-indicator class="menu-check">
										<HugeiconsIcon icon={Tick02Icon} class="size-4" />
									</media-menu-item-indicator>
								</media-menu-radio-item>
							</template>
						</media-captions-radio-group>
					</media-menu>
				{/if}
			</media-container>
		</video-player>
	</div>
</div>

<style>
	.player-root :global(video-player) {
		display: contents;
	}

	.player-root :global(media-container) {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		background: black;
	}

	/* The container is focusable (the player gives it a tabindex); keep keyboard
	   focus from painting an outline around the whole video surface. */
	.player-root :global(media-container:focus),
	.player-root :global(media-container:focus-visible),
	.player-root :global(media-container video:focus),
	.player-root :global(media-container video:focus-visible) {
		outline: none;
	}

	.player-root :global(media-container video) {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	/* Defeat Chromium's hardware-overlay promotion of fullscreen video: on some
	   Windows GPUs the overlay plane composites above our DOM controls, making
	   them vanish (DevTools-open disables promotion, which masks the bug). The
	   imperceptible filter forces the video through normal compositing. */
	.player-root :global(media-container:fullscreen video) {
		filter: brightness(1.001);
	}

	/* Lift native subtitle cues off the bottom edge (above the control bar).
	   Chromium-only pseudo-element — same mechanism the packaged skin uses. */
	.player-root :global(video::-webkit-media-text-track-container) {
		z-index: 1;
		font-family: inherit;
		translate: 0 -5.5rem;
		transition: translate 0.3s ease-out;
	}

	/* ---------- buffering ---------- */

	.player-root :global(.buffering) {
		position: absolute;
		inset: 0;
		display: none;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.player-root :global(.buffering[data-visible]) {
		display: flex;
	}

	/* ---------- control bar ---------- */

	.player-root :global(.controls) {
		position: absolute;
		inset-inline: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.5rem 1rem 0.75rem;
		background: linear-gradient(to top, rgb(0 0 0 / 0.85), rgb(0 0 0 / 0.4) 60%, transparent);
		transition: opacity 0.3s;
	}

	.player-root :global(.controls:not([data-visible])) {
		opacity: 0;
		pointer-events: none;
	}

	/* While the episodes panel is open, pin the control bar visible — the library
	   keeps toggling `data-visible` on idle and exposes no pin API. */
	.player-root.menu-open :global(.controls:not([data-visible])) {
		opacity: 1;
		pointer-events: auto;
	}

	.player-root :global(.controls-row) {
		display: flex;
		align-items: center;
		width: 100%;
	}

	/* Row 2: times left, play centered (absolute), cluster right. */
	.player-root :global(.controls-bottom) {
		position: relative;
		justify-content: space-between;
		min-height: 3rem;
	}

	.player-root :global(.center-cluster) {
		position: absolute;
		left: 50%;
		translate: -50% 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.player-root :global(.left-cluster),
	.player-root :global(.right-cluster) {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	/* ---------- buttons ---------- */

	.player-root :global(.ctrl-button) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: calc(infinity * 1px);
		color: white;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	/* Labeled variant of .ctrl-button (icon + text). */
	.player-root :global(.episodes-trigger) {
		width: auto;
		gap: 0.5rem;
		padding-inline: 0.75rem 1rem;
	}

	.player-root :global(.ctrl-button:hover) {
		background: rgb(255 255 255 / 0.15);
	}

	/* Labeled variant of .ctrl-button (text + switch). */
	.player-root :global(.autoplay-toggle) {
		width: auto;
		gap: 0.5rem;
		padding-inline: 1rem 0.75rem;
	}

	.player-root :global(.ctrl-button[data-active]),
	.player-root :global(media-cast-button[data-cast-state='connected']) {
		color: var(--primary);
	}

	/* Buttons hide themselves when their feature is unsupported (e.g. no Remote
	   Playback API for casting). */
	.player-root :global(.ctrl-button[data-hidden]) {
		display: none;
	}

	.player-root :global(.icon) {
		display: none;
		line-height: 0;
	}

	/* Play/pause state icons */
	.player-root :global(media-play-button[data-paused] .icon-play),
	.player-root :global(media-play-button:not([data-paused]) .icon-pause) {
		display: inline-flex;
	}

	/* Volume state icons */
	.player-root :global(media-mute-button[data-muted] .icon-vol-off),
	.player-root :global(media-mute-button:not([data-muted])[data-volume-level='off'] .icon-vol-off),
	.player-root :global(media-mute-button:not([data-muted])[data-volume-level='low'] .icon-vol-low),
	.player-root
		:global(media-mute-button:not([data-muted])[data-volume-level='medium'] .icon-vol-high),
	.player-root
		:global(media-mute-button:not([data-muted])[data-volume-level='high'] .icon-vol-high) {
		display: inline-flex;
	}

	/* Fallback when no volume-level attribute is present */
	.player-root
		:global(media-mute-button:not([data-muted]):not([data-volume-level]) .icon-vol-high) {
		display: inline-flex;
	}

	/* ---------- time display ---------- */

	.player-root :global(.time-display) {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		color: rgb(255 255 255 / 0.85);
		font-size: 0.875rem;
		font-variant-numeric: tabular-nums;
	}

	/* ---------- sliders ---------- */

	.player-root :global(.time-slider) {
		position: relative;
		display: flex;
		align-items: center;
		width: 100%;
		height: 1.25rem;
		cursor: pointer;
	}

	.player-root :global(.slider-track) {
		position: relative;
		width: 100%;
		height: 0.25rem;
		border-radius: calc(infinity * 1px);
		background: rgb(255 255 255 / 0.2);
		transition: height 0.15s;
	}

	.player-root :global(.time-slider:hover .slider-track) {
		height: 0.4rem;
	}

	.player-root :global(.slider-buffer),
	.player-root :global(.slider-fill) {
		position: absolute;
		inset-block: 0;
		left: 0;
		border-radius: inherit;
	}

	.player-root :global(.slider-buffer) {
		width: var(--media-slider-buffer);
		background: rgb(255 255 255 / 0.3);
	}

	.player-root :global(.slider-fill) {
		width: var(--media-slider-fill);
		background: var(--primary);
	}

	.player-root :global(.slider-thumb) {
		position: absolute;
		top: 50%;
		left: var(--media-slider-fill);
		width: 0.8rem;
		height: 0.8rem;
		border-radius: calc(infinity * 1px);
		background: white;
		translate: -50% -50%;
		opacity: 0;
		transition: opacity 0.15s;
		pointer-events: none;
	}

	.player-root :global(.time-slider:hover .slider-thumb),
	.player-root :global(.volume-slider:hover .slider-thumb) {
		opacity: 1;
	}

	/* Hover time preview above the pointer */
	.player-root :global(.slider-preview) {
		position: absolute;
		bottom: 1.5rem;
		left: var(--media-slider-pointer);
		translate: -50% 0;
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius);
		background: rgb(0 0 0 / 0.85);
		color: white;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		opacity: 0;
		transition: opacity 0.15s;
		pointer-events: none;
	}

	.player-root :global(.time-slider:hover .slider-preview) {
		opacity: 1;
	}

	/* Volume: slider expands out of the mute button on hover */
	.player-root :global(.volume-group) {
		display: flex;
		align-items: center;
	}

	.player-root :global(.volume-slider) {
		position: relative;
		display: flex;
		align-items: center;
		width: 0;
		height: 1.25rem;
		overflow: hidden;
		cursor: pointer;
		transition: width 0.2s;
	}

	.player-root :global(.volume-group:hover .volume-slider),
	.player-root :global(.volume-slider:focus-within) {
		width: 5rem;
		overflow: visible;
	}

	/* ---------- captions / quality menus ---------- */

	/* Same surface as the library's captions menu, but positioned by us: above
	   the two-row control bar, right-aligned; inside <media-container> so it's
	   visible in fullscreen. */
	.player-root :global(.quality-menu) {
		position: absolute;
		right: 1rem;
		bottom: 7.5rem;
		z-index: 10;
		display: flex;
		flex-direction: column;
	}

	.player-root :global(.captions-menu) {
		min-width: 10rem;
		padding: 0.375rem;
		border: 1px solid rgb(255 255 255 / 0.1);
		border-radius: var(--radius-xl);
		background: rgb(23 23 28 / 0.95);
		color: white;
		backdrop-filter: blur(8px);
	}

	.player-root :global(.menu-item) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius);
		font-size: 0.875rem;
		cursor: pointer;
	}

	.player-root :global(.menu-item:hover),
	.player-root :global(.menu-item[data-highlighted]) {
		background: rgb(255 255 255 / 0.1);
	}

	.player-root :global(.menu-check) {
		display: none;
		color: var(--primary);
		line-height: 0;
	}

	.player-root :global(.menu-item[data-checked] .menu-check),
	.player-root :global(.menu-item[data-state='checked'] .menu-check) {
		display: inline-flex;
	}
</style>
