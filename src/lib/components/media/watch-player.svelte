<script lang="ts">
	import '@videojs/html/video/ui';
	import { untrack } from 'svelte';
	import { releaseDownmix, setMonoDownmix } from '$lib/audio-downmix';
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
		Search01Icon,
		Settings02Icon,
		SubtitleIcon,
		Tick02Icon,
		VolumeHighIcon,
		VolumeLowIcon,
		VolumeOffIcon
	} from '@hugeicons/core-free-icons';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getScreensaver } from '$lib/screensaver.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { AudioTrack, Series, SubtitleTrack } from '$lib/data';
	import {
		cueLine,
		cueStyle,
		DEFAULT_SUBTITLE_SETTINGS,
		type SubtitleSettings
	} from '$lib/data/subtitle-settings';
	import {
		availableQualities,
		MAX_TRANSCODE_WIDTH,
		resolutionLabel,
		type QualityId
	} from '$lib/playback-quality';
	import {
		loadSubtitlePreference,
		pickSubtitleTrack,
		preferenceForTrack,
		preferenceFromLanguage,
		saveSubtitleLanguage,
		storeSubtitlePreference,
		type SubtitlePreference
	} from '$lib/subtitle-preference';
	import type { SubtitleTarget } from '$lib/subtitles-client';
	import EpisodesPanel from './episodes-panel.svelte';
	import FindSubtitlesPanel from './find-subtitles-panel.svelte';

	let {
		title,
		year,
		subtitle,
		backHref,
		videoSrc,
		videoKind = 'file',
		monoDownmix = false,
		startAt = 0,
		onProgress,
		onError,
		tracks = [],
		subtitleSettings = DEFAULT_SUBTITLE_SETTINGS,
		subtitleTarget,
		sessionId,
		canFindSubtitles = false,
		onSubtitlesChanged,
		trickplaySrc = null,
		quality = 'original',
		sourceWidth = null,
		onQualityChange,
		audioTracks = [],
		audioTrackId = null,
		onAudioChange,
		nextHref,
		show,
		currentEpisodeId,
		autoplayNext = true,
		onAutoplayChange,
		onAutoAdvance,
		onInteraction,
		stillWatchingDue = false,
		stillWatchingAfterSeconds = null
	}: {
		title: string;
		/** Release year, shown after the title (movies). */
		year?: number;
		/** Secondary line, e.g. "S1 E2 · The Tidewalker" for series episodes. */
		subtitle?: string;
		backHref: string;
		videoSrc: string;
		/** 'file' = progressive src; 'hls' = m3u8 via hls.js (native on Safari). */
		videoKind?: 'file' | 'hls';
		/** Play a direct-play file's audio as mono (audio-channels setting); HLS arrives mono already. */
		monoDownmix?: boolean;
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
		/** The viewer's subtitle language + cue styling (account settings, or defaults for guests). */
		subtitleSettings?: SubtitleSettings;
		/** What to search providers for (with `sessionId`) — enables "Find subtitles…". */
		subtitleTarget?: SubtitleTarget;
		sessionId?: string;
		/** Signed in and at least one provider configured. */
		canFindSubtitles?: boolean;
		/** WebVTT thumbnail track for seek-bar previews (sprite-sheet cues); null = none. */
		trickplaySrc?: string | null;
		/** A download added a track: the page replaces the session's list; `selectId` is the new track. */
		onSubtitlesChanged?: (tracks: SubtitleTrack[], selectId: string) => void;
		/** Current ladder rung; the quality menu only renders when `onQualityChange` is given. */
		quality?: QualityId;
		/** Probed width of the source file; hides rungs above it and labels Auto. */
		sourceWidth?: number | null;
		/** Viewer picked a rung — the page restarts the session at the current position. */
		onQualityChange?: (quality: QualityId) => void;
		/** Audio streams of the file; with 2+ and `onAudioChange` the subtitles menu gains an Audio column. */
		audioTracks?: AudioTrack[];
		/** The stream this session plays. */
		audioTrackId?: string | null;
		/** Viewer picked another stream — the page restarts the session at the current position. */
		onAudioChange?: (track: AudioTrack) => void;
		nextHref?: string;
		/** When set (with `currentEpisodeId`), shows the "More episodes" control — series only. */
		show?: Series;
		currentEpisodeId?: string;
		/** Start `nextHref` when this episode ends (the page owns and persists it). */
		autoplayNext?: boolean;
		/** The Autoplay switch was flipped. */
		onAutoplayChange?: (next: boolean) => void;
		/** Called right before autoplay moves on to `nextHref` (the page counts these for "Still watching?"). */
		onAutoAdvance?: () => void;
		/** A click, tap or key press in the player — the viewer is here. */
		onInteraction?: () => void;
		/** Series: open "Still watching?" instead of starting this episode (read once, at mount). */
		stillWatchingDue?: boolean;
		/** Movies: pause and ask after this many seconds of playback without input; null = never. */
		stillWatchingAfterSeconds?: number | null;
	} = $props();

	// No screensaver over the player, playing or paused.
	const screensaver = getScreensaver();
	$effect(() => screensaver.inhibit());

	// The controls feature toggles `data-visible` on <media-controls> (activity/idle);
	// mirror it onto our top bar so both fade in sync.
	let barVisible = $state(true);
	let videoEl: HTMLVideoElement | undefined = $state();

	// Autoplay-next is the page's setting (account or browser); the switch reports flips.
	function toggleAutoplayNext() {
		onAutoplayChange?.(!autoplayNext);
	}

	// "Still watching?": series decide per episode (the page counts autoplayed
	// episodes); movies count playing time since the last input. While open,
	// playback stays paused until the viewer chooses to continue.
	let stillWatchingOpen = $state(untrack(() => stillWatchingDue));
	let secondsWithoutInput = 0;
	let lastPlayhead: number | null = null;

	function noteInput() {
		secondsWithoutInput = 0;
		onInteraction?.();
	}

	function countWatchTime(el: HTMLVideoElement) {
		if (stillWatchingAfterSeconds === null || el.paused || stillWatchingOpen) {
			lastPlayhead = null;
			return;
		}
		const now = el.currentTime;
		// Ordinary playback advances ~0.25 s per timeupdate; seeks jump and don't count.
		if (lastPlayhead !== null && now > lastPlayhead && now - lastPlayhead < 2) {
			secondsWithoutInput += now - lastPlayhead;
		}
		lastPlayhead = now;
		if (secondsWithoutInput >= stillWatchingAfterSeconds) {
			el.pause();
			stillWatchingOpen = true;
		}
	}

	// Keyboard/remote users land on "Continue watching" when the prompt opens.
	const focusOnMount = (el: HTMLElement) => el.focus();

	function continueWatching() {
		stillWatchingOpen = false;
		noteInput();
		videoEl?.play().catch(() => {});
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
		countWatchTime(videoEl);
	}

	const nextCountdown = $derived(
		!stillWatchingOpen &&
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
	// Read through deriveds: a parent re-creating its playback object with the
	// same src/kind/startAt must not re-source the video (it would refresh and
	// seek back to the resume point); deriveds only notify on a changed value.
	const sourceSrc = $derived(videoSrc);
	const sourceKind = $derived(videoKind);
	const sourceStartAt = $derived(startAt);

	// Declared before the source effect so the audio graph exists when autoplay
	// starts. Through a derived so only a changed value reaches the graph, and
	// setMonoDownmix is idempotent per element anyway: a re-run must never
	// rebuild it (createMediaElementSource throws on the second call).
	const wantMono = $derived(monoDownmix && sourceKind === 'file');
	$effect(() => {
		if (videoEl) setMonoDownmix(videoEl, wantMono);
	});
	// Separate effect: its cleanup runs only when the element itself changes or unmounts.
	$effect(() => {
		const el = videoEl;
		return () => {
			if (el) releaseDownmix(el);
		};
	});

	$effect(() => {
		const el = videoEl;
		const src = sourceSrc;
		const kind = sourceKind;
		const startFrom = sourceStartAt;
		if (!el) return;

		const resumeAt = startFrom > 0 ? startFrom : null;
		// A due "Still watching?" prompt holds the episode at its start. Untracked:
		// the flag must never become a reason to re-source the video.
		const autoStart = () => {
			if (!untrack(() => stillWatchingOpen)) el.play().catch(() => {});
		};

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
			autoStart();
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
				hls = new Hls({
					...(resumeAt !== null ? { startPosition: resumeAt } : {}),
					// libx264 passes broadcast CEA-608/708 caption data through; hls.js
					// would surface it as phantom "English"/"Spanish" text tracks next
					// to ours. Subtitles come only from our own <track> elements.
					enableCEA708Captions: false
				});
				hls.loadSource(src);
				hls.attachMedia(el);
				hls.on(Hls.Events.MANIFEST_PARSED, autoStart);
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
		onAutoAdvance?.();
		/* eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass resolve()d paths */
		goto(nextHref).catch(() => {});
	}

	// Episodes panel (series only). While open, player chrome is pinned visible
	// even when the library marks the controls idle.
	let episodesOpen = $state(false);
	let qualityOpen = $state(false);
	let subtitlesOpen = $state(false);
	let findSubtitlesOpen = $state(false);
	const menuOpen = $derived(
		episodesOpen || qualityOpen || subtitlesOpen || findSubtitlesOpen || stillWatchingOpen
	);
	const hasAudioChoice = $derived(audioTracks.length > 1 && !!onAudioChange);
	const showSubtitlesButton = $derived(tracks.length > 0 || canFindSubtitles || hasAudioChoice);
	const subtitlesMenuLabel = $derived(hasAudioChoice ? 'Audio & subtitles' : 'Subtitles');
	const qualityOptions = $derived(availableQualities(sourceWidth));
	// What "Original" resolves to for this file: the source itself, capped at the
	// transcoder's 4K ceiling while an Original transcode is playing.
	const originalResolution = $derived.by(() => {
		if (!sourceWidth) return '';
		const transcodingOriginal = quality === 'original' && videoKind === 'hls';
		return resolutionLabel(
			transcodingOriginal ? Math.min(sourceWidth, MAX_TRANSCODE_WIDTH) : sourceWidth
		);
	});
	// Shown on the row that is actually playing.
	const delivery = $derived(videoKind === 'hls' ? 'transcoded' : 'direct play');
	const chromeVisible = $derived(barVisible || menuOpen);

	// Close on any pointerdown outside the open surface and its trigger.
	$effect(() => {
		if (!menuOpen) return;
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Element | null;
			if (!target?.closest('.episodes-panel, .episodes-trigger')) episodesOpen = false;
			if (!target?.closest('.quality-menu, .quality-trigger')) qualityOpen = false;
			if (!target?.closest('.subtitles-menu, .subtitles-trigger')) subtitlesOpen = false;
			if (!target?.closest('.find-subtitles-panel, .subtitles-trigger')) findSubtitlesOpen = false;
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
		// The prompt's own buttons take the keys; nothing may resume behind it.
		if (stillWatchingOpen) return;
		// Escape closes the episodes panel even while one of its controls has focus.
		// (In fullscreen the browser may consume Escape to exit fullscreen first.)
		if (event.key === 'Escape' && menuOpen) {
			episodesOpen = false;
			qualityOpen = false;
			subtitlesOpen = false;
			findSubtitlesOpen = false;
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
		} else if ((event.key === 'c' || event.key === 'C') && tracks.length > 0) {
			event.preventDefault();
			toggleSubtitles();
		}
	}

	// Subtitles. Our <track> elements are the only text tracks we manage (never
	// video.textTracks by index — hls.js may add its own); the remembered
	// language / "off" is re-applied whenever the track set changes (next
	// episode, quality restart) and the choice is reported back from the DOM
	// so the menu reflects whatever the browser actually shows.
	let trackEls: Record<string, HTMLTrackElement> = $state({});
	// Signed-in viewers' language lives in their account settings (the menu
	// writes back to it); guests get this browser's remembered choice, else
	// the defaults.
	const accountSubtitles = $derived(page.data.user != null);
	const subtitlePreference: SubtitlePreference = $derived(
		accountSubtitles
			? preferenceFromLanguage(subtitleSettings.language)
			: (loadSubtitlePreference() ?? preferenceFromLanguage(subtitleSettings.language))
	);
	// The viewer's explicit pick applies to one track list (identified by its
	// ids): when the list changes (next episode, quality restart) the preference
	// picks again. A download sets the choice for the *incoming* list before the
	// page swaps it in, so the new track is selected the moment it renders.
	const listKey = (list: SubtitleTrack[]) => list.map((track) => track.id).join('|');
	let choice = $state.raw<{ key: string; id: string | null } | null>(null);
	const selectedTrackId: string | null = $derived(
		choice?.key === listKey(tracks)
			? choice.id
			: (pickSubtitleTrack(tracks, subtitlePreference)?.id ?? null)
	);
	function setSelected(id: string | null, list: SubtitleTrack[] = tracks) {
		choice = { key: listKey(list), id };
	}
	let failedTrackIds: string[] = $state([]);
	let lastShownTrackId: string | null = null;
	// When we last set modes ourselves; the browser's `change` echo of that is not a viewer action.
	let modesAppliedAt = 0;

	// The thumbnail track is metadata, not a subtitle choice: it stays `hidden`
	// (the mode that makes the browser fetch and parse the cues) and is set here
	// rather than via `default` so its `change` echo can't read as the viewer
	// switching subtitles off.
	let thumbTrackEl: HTMLTrackElement | undefined = $state();

	function applyTrackModes() {
		for (const track of tracks) {
			const el = trackEls[track.id];
			if (!el) continue;
			const mode = track.id === selectedTrackId ? 'showing' : 'disabled';
			if (el.track.mode !== mode) {
				el.track.mode = mode;
				modesAppliedAt = Date.now();
			}
		}
		if (thumbTrackEl && thumbTrackEl.track.mode !== 'hidden') {
			thumbTrackEl.track.mode = 'hidden';
			modesAppliedAt = Date.now();
		}
	}
	$effect(applyTrackModes);

	$effect(() => {
		const el = videoEl;
		if (!el) return;
		const onChange = () => {
			// Ignore the echo of our own mode changes and events while track elements
			// are still mounting — the DOM isn't the viewer's decision yet.
			if (Date.now() - modesAppliedAt < 500 || tracks.some((track) => !trackEls[track.id])) return;
			const showing = tracks.find((track) => trackEls[track.id]?.track.mode === 'showing');
			const id = showing?.id ?? null;
			if (id !== selectedTrackId) setSelected(id);
		};
		el.textTracks.addEventListener('change', onChange);
		return () => el.textTracks.removeEventListener('change', onChange);
	});

	// Cue placement: WebVTT cues default to the very bottom edge. Each cue's
	// `line` is set instead of styling ::-webkit-media-text-track-container —
	// the property works in every engine and survives fullscreen. Negative =
	// lines counted up from the bottom (-1 is the edge); the viewer's position
	// setting picks how many.
	function liftCues(cues: TextTrackCueList | null) {
		if (!cues) return;
		const line = cueLine(subtitleSettings.position);
		for (const cue of cues) {
			if (cue instanceof VTTCue && cue.line !== line) cue.line = line;
		}
	}
	// Cues parsed before the track finished loading are lifted as they activate;
	// `load` catches the whole list once the file is in.
	function positionCues(el: HTMLTrackElement) {
		const onLoad = () => liftCues(el.track.cues);
		const onCueChange = () => liftCues(el.track.activeCues);
		el.addEventListener('load', onLoad);
		el.track.addEventListener('cuechange', onCueChange);
		return () => {
			el.removeEventListener('load', onLoad);
			el.track.removeEventListener('cuechange', onCueChange);
		};
	}

	function chooseTrack(track: SubtitleTrack | null) {
		subtitlesOpen = false;
		if (track) lastShownTrackId = track.id;
		setSelected(track?.id ?? null);
		// A track with no language ("Track 1") is a one-off pick; it never
		// overwrites the remembered language.
		const preference = preferenceForTrack(track);
		if (!preference) return;
		storeSubtitlePreference(preference);
		if (accountSubtitles) void saveSubtitleLanguage(preference);
	}

	// A download finished: the page swaps in the session's new track list and
	// we select the new track once it has rendered.
	function onDownloaded(newTracks: SubtitleTrack[], trackId: string) {
		findSubtitlesOpen = false;
		const track = newTracks.find((t) => t.id === trackId);
		if (track) {
			lastShownTrackId = track.id;
			setSelected(track.id, newTracks);
			const preference = preferenceForTrack(track);
			if (preference) {
				storeSubtitlePreference(preference);
				if (accountSubtitles) void saveSubtitleLanguage(preference);
			}
		}
		onSubtitlesChanged?.(newTracks, trackId);
	}

	function toggleSubtitles() {
		if (selectedTrackId) {
			chooseTrack(null);
			return;
		}
		const fallback =
			tracks.find((track) => track.id === lastShownTrackId) ??
			pickSubtitleTrack(tracks, null) ??
			tracks.find((track) => !track.forced) ??
			tracks[0];
		chooseTrack(fallback);
	}

	function syncTopBar(node: HTMLElement) {
		const update = () => (barVisible = node.hasAttribute('data-visible'));
		update();
		const observer = new MutationObserver(update);
		observer.observe(node, { attributes: true, attributeFilter: ['data-visible'] });
		return () => observer.disconnect();
	}

	// Fullscreen the whole document, not <media-container>: the watch pages unmount
	// this player on every session restart (quality/audio change, next episode),
	// and removing the fullscreened element would drop the browser out of
	// fullscreen. The player root is fixed full-viewport, so it fills the screen;
	// the watch pages exit fullscreen when the viewer leaves the route.
	let isFullscreen = $state(!!document.fullscreenElement);

	function toggleFullscreen() {
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => {});
		} else {
			document.documentElement.requestFullscreen().catch(() => {});
		}
	}
</script>

<!-- Capture phase: any input counts as the viewer being there ("Still watching?"). -->
<svelte:window {onkeydown} onpointerdowncapture={noteInput} onkeydowncapture={noteInput} />
<svelte:document onfullscreenchange={() => (isFullscreen = !!document.fullscreenElement)} />

<div
	class={[
		// `dark`: the player keeps its dark chrome in the light theme too.
		'player-root dark fixed inset-0 z-50 flex flex-col bg-black',
		!chromeVisible && 'cursor-none',
		menuOpen && 'menu-open',
		isFullscreen && 'is-fullscreen'
	]}
	style={cueStyle(subtitleSettings)}
>
	<div class="min-h-0 flex-1">
		<video-player>
			<media-container>
				<!-- src is attached programmatically (file/HLS) by the source effect. -->
				<video
					bind:this={videoEl}
					slot="media"
					playsinline
					preload="metadata"
					onended={onVideoEnded}
					ontimeupdate={onTimeUpdate}
					onloadstart={() => (remainingSeconds = null)}
					onloadedmetadata={applyTrackModes}
				>
					{#each tracks as track (track.id)}
						<track
							bind:this={trackEls[track.id]}
							kind={track.kind}
							src={track.src}
							srclang={track.srclang}
							label={track.label}
							default={track.id === selectedTrackId}
							onerror={() => (failedTrackIds = [...failedTrackIds, track.id])}
							{@attach positionCues}
						/>
					{/each}
					{#if trickplaySrc}
						<!-- Read by <media-slider-thumbnail> through the player store (kind + label are its lookup key). -->
						<track bind:this={thumbTrackEl} kind="metadata" label="thumbnails" src={trickplaySrc} />
					{/if}
				</video>

				<!-- Inside media-container so hovering it counts as player activity (keeps
				     controls visible; also shows in fullscreen). -->
				<div
					class={[
						'absolute inset-x-0 top-0 z-10 flex items-center gap-4 bg-linear-to-b from-black/80 to-transparent px-4 pt-5 pb-10 transition-opacity duration-300 sm:px-6 sm:pt-6',
						!chromeVisible && 'pointer-events-none opacity-0'
					]}
				>
					<!-- callers pass resolve()d paths -->
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						href={backHref}
						aria-label="Back"
						class="flex size-12 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
					>
						<!-- 1px down: the title's ink sits low (mostly lowercase), so a
						     geometrically centred chevron reads as higher than the text. -->
						<HugeiconsIcon icon={ArrowLeft01Icon} class="size-8 translate-y-px" />
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
					<div class="flex min-w-0 flex-col">
						<!-- The year sits outside the truncating span, so a long title never hides it.
						     It shares the title's baseline one size smaller: at full size its
						     cap-height digits and tall parentheses read as higher than the mostly
						     lowercase title. overflow-clip (not truncate's overflow-hidden) keeps
						     the title's text baseline; a hidden-overflow box's baseline is its
						     bottom edge, which would lift the year. min-w-0 lets it shrink (clip,
						     unlike hidden, doesn't zero a flex item's automatic minimum width). -->
						<div class="flex min-w-0 items-baseline gap-2 text-white">
							<span
								class="min-w-0 overflow-clip text-xl font-semibold text-ellipsis whitespace-nowrap sm:text-2xl"
								>{title}</span
							>
							{#if year}
								<span class="shrink-0 text-lg text-white/60 sm:text-xl">({year})</span>
							{/if}
						</div>
						{#if subtitle}
							<span class="truncate text-sm text-white/70 sm:text-base">{subtitle}</span>
						{/if}
					</div>
					{#if nextHref}
						<Button
							href={nextHref}
							variant="secondary"
							size="lg"
							class="ml-auto shrink-0 bg-white/15 text-base text-white backdrop-blur hover:bg-white/25"
						>
							Next episode
							<HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" class="size-5" />
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
								<media-slider-thumbnail class="slider-thumbnail"></media-slider-thumbnail>
								<media-slider-value class="slider-time" type="pointer"></media-slider-value>
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

							{#if showSubtitlesButton}
								<button
									type="button"
									class="ctrl-button subtitles-trigger"
									aria-haspopup="menu"
									aria-expanded={subtitlesOpen || findSubtitlesOpen}
									aria-label={subtitlesMenuLabel}
									data-active={selectedTrackId ? '' : undefined}
									onclick={() => {
										// While the search panel is open the button just closes it.
										if (findSubtitlesOpen) findSubtitlesOpen = false;
										else subtitlesOpen = !subtitlesOpen;
									}}
								>
									<HugeiconsIcon icon={SubtitleIcon} class="size-6" />
								</button>
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
									{#if option.id === 'original' && originalResolution}
										<span class="text-white/50">· {originalResolution}</span>
									{/if}
									{#if option.id === quality}
										<span class="text-white/50">· {delivery}</span>
									{/if}
								</span>
								{#if option.id === quality}
									<HugeiconsIcon icon={Tick02Icon} class="size-4 text-primary" />
								{/if}
							</button>
						{/each}
					</div>
				{/if}

				{#if findSubtitlesOpen && subtitleTarget && sessionId}
					<FindSubtitlesPanel
						target={subtitleTarget}
						{sessionId}
						initialLanguage={subtitleSettings.language === 'off' ? 'en' : subtitleSettings.language}
						onclose={() => (findSubtitlesOpen = false)}
						ondownloaded={onDownloaded}
					/>
				{/if}

				{#if subtitlesOpen && showSubtitlesButton}
					<!-- With 2+ audio streams: an Audio column beside the Subtitles one. -->
					<div
						class={['subtitles-menu quality-menu captions-menu', hasAudioChoice && 'menu-columns']}
						role="menu"
						aria-label={subtitlesMenuLabel}
					>
						{#if hasAudioChoice}
							<div class="menu-column" role="group" aria-label="Audio">
								<p class="menu-heading">Audio</p>
								{#each audioTracks as track (track.id)}
									<button
										type="button"
										role="menuitemradio"
										aria-checked={track.id === audioTrackId}
										class="menu-item w-full"
										onclick={() => {
											subtitlesOpen = false;
											if (track.id !== audioTrackId) onAudioChange?.(track);
										}}
									>
										<span>{track.label}</span>
										{#if track.id === audioTrackId}
											<HugeiconsIcon icon={Tick02Icon} class="size-4 text-primary" />
										{/if}
									</button>
								{/each}
							</div>
							<div class="menu-column-divider" role="separator"></div>
						{/if}
						<div class="menu-column" role="group" aria-label="Subtitles">
							{#if hasAudioChoice}
								<p class="menu-heading">Subtitles</p>
							{/if}
							{#if canFindSubtitles && subtitleTarget && sessionId}
								<button
									type="button"
									role="menuitem"
									class="menu-item w-full"
									onclick={() => {
										subtitlesOpen = false;
										findSubtitlesOpen = true;
									}}
								>
									<span>Find subtitles…</span>
									<HugeiconsIcon icon={Search01Icon} class="size-4 text-white/60" />
								</button>
								<div class="menu-separator" role="separator"></div>
							{/if}
							<button
								type="button"
								role="menuitemradio"
								aria-checked={selectedTrackId === null}
								class="menu-item w-full"
								onclick={() => chooseTrack(null)}
							>
								<span>Off</span>
								{#if selectedTrackId === null}
									<HugeiconsIcon icon={Tick02Icon} class="size-4 text-primary" />
								{/if}
							</button>
							{#each tracks as track (track.id)}
								{@const failed = failedTrackIds.includes(track.id)}
								<button
									type="button"
									role="menuitemradio"
									aria-checked={selectedTrackId === track.id}
									class="menu-item w-full"
									disabled={failed}
									onclick={() => chooseTrack(track)}
								>
									<span>
										{track.label}
										{#if failed}
											<span class="text-white/50">· unavailable</span>
										{/if}
									</span>
									{#if selectedTrackId === track.id}
										<HugeiconsIcon icon={Tick02Icon} class="size-4 text-primary" />
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{/if}
				{#if stillWatchingOpen}
					<div
						class="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
						role="dialog"
						aria-modal="true"
						aria-labelledby="still-watching-title"
					>
						<div class="flex max-w-md flex-col items-center gap-5 text-center text-white">
							<div class="flex flex-col gap-1.5">
								<h2 id="still-watching-title" class="text-2xl font-semibold">
									Are you still watching?
								</h2>
								<p class="text-white/70">{subtitle ? `${title} · ${subtitle}` : title}</p>
							</div>
							<div class="flex flex-wrap justify-center gap-3">
								<Button size="lg" onclick={continueWatching} {@attach focusOnMount}>
									Continue watching
								</Button>
								<!-- backHref is a resolve()d path from the page -->
								<!-- eslint-disable svelte/no-navigation-without-resolve -->
								<a
									href={backHref}
									class="inline-flex h-10 items-center rounded-4xl px-5 text-sm font-medium text-white/80 ring-1 ring-white/25 transition-colors hover:bg-white/10 hover:text-white"
								>
									Back to browse
								</a>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							</div>
						</div>
					</div>
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
	.player-root.is-fullscreen :global(media-container video) {
		filter: brightness(1.001);
	}

	/* Cue placement is done per cue (VTTCue.line, see positionCues); this only
	   keeps Chromium's cue container above the video and in the app font. */
	.player-root :global(video::-webkit-media-text-track-container) {
		z-index: 1;
		font-family: inherit;
	}

	/* Viewer's cue styling (settings → cueStyle() custom properties on .player-root;
	   custom properties inherit into the video's cue shadow tree). */
	.player-root :global(video::cue) {
		color: var(--cue-color);
		font-family: var(--cue-font);
		font-size: var(--cue-size);
		text-shadow: var(--cue-shadow);
		background: var(--cue-background);
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

	/* Hover preview above the pointer: scene thumbnail (when the device made
	   sprite sheets) over the time pill. The library positions the element
	   itself with inline styles (`left` clamped to the slider, `width:
	   max-content`), so no `left`/`translate` here — they would double-shift. */
	.player-root :global(.slider-preview) {
		position: absolute;
		bottom: 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.375rem;
		opacity: 0;
		transition: opacity 0.15s;
		pointer-events: none;
	}

	.player-root :global(.slider-time) {
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius);
		background: rgb(0 0 0 / 0.85);
		color: white;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	/* The element sizes itself from the tile geometry within max-width. */
	.player-root :global(.slider-thumbnail) {
		display: block;
		max-width: min(400px, 50vw);
		border-radius: var(--radius);
		overflow: hidden;
		background: black;
		box-shadow:
			0 0 0 1px rgb(255 255 255 / 0.15),
			0 8px 24px rgb(0 0 0 / 0.6);
	}

	.player-root :global(.slider-thumbnail[data-hidden]),
	.player-root :global(.slider-thumbnail[data-error]) {
		display: none;
	}

	/* A sheet still loading would show the previous sheet's pixels at the new tile's offset. */
	.player-root :global(.slider-thumbnail[data-loading]) {
		visibility: hidden;
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

	.player-root :global(.subtitles-menu) {
		max-height: min(60vh, 24rem);
		overflow-y: auto;
	}

	.player-root :global(.menu-column) {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	/* Audio + Subtitles side by side, each column scrolling on its own. */
	.player-root :global(.subtitles-menu.menu-columns) {
		flex-direction: row;
		max-height: none;
		overflow: visible;
	}

	.player-root :global(.menu-columns .menu-column) {
		min-width: 12rem;
		max-height: min(60vh, 24rem);
		overflow-y: auto;
	}

	.player-root :global(.menu-column-divider) {
		flex: none;
		width: 1px;
		margin: 0.25rem 0.375rem;
		background: rgb(255 255 255 / 0.18);
	}

	.player-root :global(.menu-heading) {
		padding: 0.375rem 0.75rem 0.25rem;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgb(255 255 255 / 0.5);
	}

	/* Phones: stack the columns and scroll the whole menu again. */
	@media (max-width: 640px) {
		.player-root :global(.subtitles-menu.menu-columns) {
			flex-direction: column;
			max-height: min(60vh, 24rem);
			overflow-y: auto;
		}

		.player-root :global(.menu-columns .menu-column) {
			max-height: none;
			overflow: visible;
		}

		.player-root :global(.menu-column-divider) {
			width: auto;
			height: 1px;
			margin: 0.25rem 0.5rem;
		}
	}

	/* flex: none — an empty flex item in the scrollable column would otherwise
	   shrink to 0 and leave only its margins. */
	.player-root :global(.menu-separator) {
		flex: none;
		height: 1px;
		margin: 0.25rem 0.5rem;
		background: rgb(255 255 255 / 0.18);
	}

	.player-root :global(.menu-item:disabled) {
		cursor: default;
		color: rgb(255 255 255 / 0.5);
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
