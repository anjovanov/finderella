<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { ScreensaverSettings } from '$lib/data/preferences';
	import { getScreensaver } from '$lib/screensaver.svelte';

	let { settings }: { settings: ScreensaverSettings } = $props();

	const screensaver = getScreensaver();

	interface Artwork {
		title: string;
		year: number;
		backdropUrl: string;
	}

	const SLIDE_MS = 10_000;
	const LOGO_MOVE_MS = 10_000;
	/** Input right after activation (the hand leaving the mouse, the preview click) doesn't dismiss. */
	const WAKE_GRACE_MS = 600;
	/** Pointer travel that counts as "the viewer is back" — ignores sensor jitter. */
	const WAKE_DISTANCE_PX = 24;
	/** How long after a dismissing pointerdown its click is still swallowed. */
	const SWALLOW_CLICK_MS = 800;

	/* ---------- idle timer ---------- */

	let idleTimer: ReturnType<typeof setTimeout> | undefined;

	/** (Re)start the countdown — on every input, even while showing, and when the tab comes back. */
	function arm() {
		clearTimeout(idleTimer);
		if (!settings.enabled || screensaver.inhibited || document.hidden) return;
		const kind = settings.kind;
		idleTimer = setTimeout(() => screensaver.show(kind), settings.seconds * 1000);
	}

	// Re-arms whenever the settings or the inhibitors change (arm reads them).
	$effect(() => {
		arm();
		return () => clearTimeout(idleTimer);
	});

	/* ---------- waking up ---------- */

	// The input that dismisses is swallowed so it can't click a link or press a
	// focused button underneath — including the click that follows the
	// dismissing pointerdown once the overlay is gone.
	let wakeOrigin: { x: number; y: number } | null = null;
	let swallowClickUntil = 0;

	const inGrace = () => performance.now() - screensaver.activatedAt < WAKE_GRACE_MS;

	function onpointermove(event: PointerEvent) {
		arm();
		if (!screensaver.active) {
			wakeOrigin = null;
			return;
		}
		if (inGrace()) return;
		wakeOrigin ??= { x: event.clientX, y: event.clientY };
		if (Math.hypot(event.clientX - wakeOrigin.x, event.clientY - wakeOrigin.y) > WAKE_DISTANCE_PX) {
			screensaver.dismiss();
		}
	}

	function onpress(event: PointerEvent | KeyboardEvent) {
		arm();
		if (!screensaver.active) return;
		event.preventDefault();
		event.stopPropagation();
		if (inGrace()) return;
		if (event.type === 'pointerdown') swallowClickUntil = performance.now() + SWALLOW_CLICK_MS;
		screensaver.dismiss();
	}

	function onclick(event: MouseEvent) {
		if (!screensaver.active && performance.now() > swallowClickUntil) return;
		swallowClickUntil = 0;
		event.preventDefault();
		event.stopPropagation();
	}

	function onwheel() {
		arm();
		if (screensaver.active && !inGrace()) screensaver.dismiss();
	}

	// The page's scrollbar would otherwise show along the overlay's edge.
	$effect(() => {
		if (!screensaver.active) return;
		const root = document.documentElement;
		const previous = root.style.overflow;
		root.style.overflow = 'hidden';
		return () => {
			root.style.overflow = previous;
		};
	});

	/* ---------- media slideshow ---------- */

	// Replaced wholesale, never mutated: no deep proxy needed.
	let artwork = $state.raw<Artwork[] | null>(null);
	let artworkRequested = false;
	/** Where the slideshow resumes next time; not rendered, so not reactive. */
	let slideIndex = 0;
	/** Only a slide whose image has decoded is shown, so fades never reveal a half-loaded picture. */
	let shownSlide = $state.raw<(Artwork & { key: number }) | null>(null);

	async function loadArtwork() {
		if (artworkRequested) return;
		artworkRequested = true;
		try {
			const res = await fetch('/api/screensaver/artwork');
			artwork = res.ok ? ((await res.json()) as Artwork[]) : [];
		} catch {
			artwork = [];
		}
	}

	async function preload(url: string): Promise<boolean> {
		const img = new Image();
		img.src = url;
		try {
			await img.decode();
			return true;
		} catch {
			return false;
		}
	}

	// Artwork mode falls back to the logo when the catalog has no backdrops.
	const showMedia = $derived(
		screensaver.active === 'media' && (artwork === null || artwork.length > 0)
	);

	// Cycles slides on a timer while showing; the first activation fetches the list.
	$effect(() => {
		if (!showMedia) return;
		if (!artwork) {
			void loadArtwork();
			return;
		}
		const slides = artwork;
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let key = 0;
		const show = async (index: number) => {
			// Skip images that fail to load; give up after one full pass.
			for (let tries = 0; tries < slides.length && !cancelled; tries++) {
				const next = (index + tries) % slides.length;
				if (await preload(slides[next].backdropUrl)) {
					if (cancelled) return;
					slideIndex = next;
					shownSlide = { ...slides[next], key: key++ };
					timer = setTimeout(() => void show(next + 1), SLIDE_MS);
					return;
				}
			}
		};
		void show(slideIndex);
		return () => {
			cancelled = true;
			clearTimeout(timer);
			shownSlide = null;
		};
	});

	/* ---------- logo ---------- */

	// The wordmark hops to a new spot every few seconds so nothing burns in
	// (it stays centred for reduced motion).
	let logoPosition = $state.raw({ key: 0, x: 50, y: 50 });
	$effect(() => {
		if (!screensaver.active || showMedia) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		let key = 0;
		const move = () => {
			logoPosition = { key: ++key, x: 20 + Math.random() * 60, y: 20 + Math.random() * 60 };
		};
		move();
		const interval = setInterval(move, LOGO_MOVE_MS);
		return () => {
			clearInterval(interval);
			logoPosition = { key: 0, x: 50, y: 50 };
		};
	});
</script>

<!-- Capture phase: activity counts wherever it lands, and a wake-up input is
     stopped before any control underneath sees it. touchstart only re-arms
     (the pointerdown that follows does the waking). -->
<svelte:window
	onpointermovecapture={onpointermove}
	onpointerdowncapture={onpress}
	onkeydowncapture={onpress}
	onclickcapture={onclick}
	onwheelcapture={onwheel}
	ontouchstartcapture={arm}
/>
<svelte:document onvisibilitychange={arm} />

{#if screensaver.active}
	<!-- `dark`: the screensaver looks the same in both themes. -->
	<div
		class="screensaver dark fixed inset-0 z-[100] cursor-none overflow-hidden bg-black text-white"
		role="presentation"
		aria-hidden="true"
		in:fade={{ duration: 800 }}
		out:fade={{ duration: 200 }}
	>
		{#if showMedia}
			{#if shownSlide}
				{#key shownSlide.key}
					<div class="absolute inset-0" transition:fade={{ duration: 1500 }}>
						<img
							src={shownSlide.backdropUrl}
							alt=""
							class="kenburns h-full w-full object-cover"
							style:transform-origin={shownSlide.key % 2 ? '30% 40%' : '70% 60%'}
						/>
						<div
							class="absolute inset-0 bg-[linear-gradient(to_top,rgb(0_0_0/0.75),transparent_45%)]"
						></div>
						<div class="absolute bottom-10 left-10 flex flex-col gap-1 sm:bottom-14 sm:left-14">
							<span class="text-3xl font-semibold drop-shadow sm:text-5xl">{shownSlide.title}</span>
							<span class="text-lg text-white/70 sm:text-xl">{shownSlide.year}</span>
						</div>
					</div>
				{/key}
			{/if}
			<span
				class="absolute right-10 bottom-10 text-sm font-bold tracking-[0.25em] text-primary sm:right-14 sm:bottom-14"
			>
				FINDERELLA
			</span>
		{:else}
			{#key logoPosition.key}
				<span
					class="absolute -translate-x-1/2 -translate-y-1/2 text-3xl font-bold tracking-[0.3em] text-primary sm:text-5xl"
					style:left="{logoPosition.x}%"
					style:top="{logoPosition.y}%"
					transition:fade={{ duration: 1200 }}
				>
					FINDERELLA
				</span>
			{/key}
		{/if}
	</div>
{/if}

<style>
	/* Slow push-in over each slide's lifetime (a little longer, so it never stops). */
	.kenburns {
		animation: kenburns 12s ease-out forwards;
	}

	@keyframes kenburns {
		from {
			transform: scale(1);
		}
		to {
			transform: scale(1.08);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.kenburns {
			animation: none;
		}
	}
</style>
