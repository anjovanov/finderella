<script lang="ts" module>
	import {
		Alien01Icon,
		CatIcon,
		CrownIcon,
		FavouriteIcon,
		Flower01Icon,
		FootballIcon,
		GameController03Icon,
		GhostIcon,
		GuitarIcon,
		IceCreamIcon,
		MusicNote01Icon,
		PandaIcon,
		PizzaIcon,
		PopcornIcon,
		RabbitIcon,
		RainbowIcon,
		Robot01Icon,
		Rocket01Icon,
		SmileIcon,
		StarIcon
	} from '@hugeicons/core-free-icons';
	import type { IconSvgElement } from '@hugeicons/svelte';
	import type { ProfileIcon } from '$lib/data/profiles';

	export const PROFILE_ICON_COMPONENTS: Record<ProfileIcon, IconSvgElement> = {
		smile: SmileIcon,
		star: StarIcon,
		heart: FavouriteIcon,
		crown: CrownIcon,
		rocket: Rocket01Icon,
		ghost: GhostIcon,
		cat: CatIcon,
		alien: Alien01Icon,
		robot: Robot01Icon,
		game: GameController03Icon,
		popcorn: PopcornIcon,
		music: MusicNote01Icon,
		panda: PandaIcon,
		rabbit: RabbitIcon,
		pizza: PizzaIcon,
		icecream: IceCreamIcon,
		football: FootballIcon,
		guitar: GuitarIcon,
		rainbow: RainbowIcon,
		flower: Flower01Icon
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { profileColorCss, profileInitial } from '$lib/data/profiles';
	import { cn } from '$lib/utils.js';

	/**
	 * A profile's avatar: a rounded tile in its color with its icon, or its
	 * initial. `children` replaces that glyph (the manager's edit pencil).
	 */
	let {
		name,
		color,
		icon = null,
		size = 'md',
		class: className,
		children
	}: {
		name: string;
		color: string;
		icon?: ProfileIcon | null;
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
		class?: string;
		children?: Snippet;
	} = $props();

	const sizes = {
		xs: { box: 'size-6 rounded-md text-xs', icon: 'size-3.5' },
		sm: { box: 'size-8 rounded-lg text-sm', icon: 'size-4.5' },
		md: { box: 'size-11 rounded-xl text-lg', icon: 'size-6' },
		lg: { box: 'size-16 rounded-2xl text-2xl', icon: 'size-8' },
		xl: { box: 'size-24 rounded-3xl text-4xl sm:size-32', icon: 'size-12 sm:size-16' }
	};
</script>

<span
	aria-hidden="true"
	class={cn(
		'inline-flex shrink-0 items-center justify-center font-semibold text-white select-none',
		sizes[size].box,
		className
	)}
	style:background-color={profileColorCss(color)}
>
	{#if children}
		{@render children()}
	{:else if icon}
		<!-- Keyed: HugeiconsIcon draws its `icon` once on mount and ignores later changes. -->
		{#key icon}
			<HugeiconsIcon icon={PROFILE_ICON_COMPONENTS[icon]} class={sizes[size].icon} />
		{/key}
	{:else}
		{profileInitial(name)}
	{/if}
</span>
