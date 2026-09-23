<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import { LANGUAGES } from '@finderella/protocol/languages';
	import { DEFAULT_AUDIO_LANGUAGE } from '$lib/audio-preference';
	import { canDecodeSurround, detectOutputChannels } from '$lib/audio-output';
	import {
		AUDIO_CHANNEL_LABELS,
		AUDIO_CHANNEL_OPTIONS,
		episodesLabel,
		type AudioChannels,
		resolveAudioChannels,
		minutesLabel,
		STILL_WATCHING_EPISODES,
		STILL_WATCHING_MINUTES
	} from '$lib/data/playback-settings';

	let { data, form } = $props();

	let audioLanguage = $derived(data.playbackSettings.audioLanguage);
	let audioChannels = $derived(data.playbackSettings.audioChannels);
	let autoplayNext = $derived(data.playbackSettings.autoplayNext);
	let stillWatching = $derived(data.playbackSettings.stillWatching.enabled);
	let stillWatchingEpisodes = $derived(String(data.playbackSettings.stillWatching.episodes));
	let stillWatchingMinutes = $derived(String(data.playbackSettings.stillWatching.minutes));

	// What this browser/device supports; undefined until it has been asked.
	let deviceChannels = $state<number | null | undefined>(undefined);
	let surroundDecodable = $state<boolean | undefined>(undefined);
	$effect(() => {
		void detectOutputChannels().then((channels) => (deviceChannels = channels));
		void canDecodeSurround().then((ok) => (surroundDecodable = ok));
	});
	// Explains the selected option (updates as the select changes, before saving).
	const CHANNEL_DESCRIPTIONS: Record<AudioChannels, string> = {
		auto: "Uses 5.1 surround when this device's audio output supports it, otherwise stereo.",
		stereo:
			'Surround soundtracks play as two-channel stereo. Right for headphones and laptop or TV speakers.',
		surround:
			'Surround soundtracks play in 5.1; stereo ones stay stereo. Choose this if you listen through a surround sound system.',
		mono: 'All sound comes out of every speaker equally. Useful with a single earbud or hearing in one ear.'
	};
	// What Auto amounts to on this browser/device, once it has been asked.
	const autoResult = $derived.by(() => {
		if (surroundDecodable === undefined || deviceChannels === undefined) return null;
		return resolveAudioChannels('auto', deviceChannels, surroundDecodable) === 6
			? '5.1 surround'
			: 'Stereo';
	});

	// 'default' = the track the file flags as default, which is usually the original language.
	const ORIGINAL_LANGUAGE = 'Original language';

	const languageOptions = LANGUAGES.map(({ code, name }) => ({ code, name })).toSorted((a, b) =>
		a.name.localeCompare(b.name)
	);
	function languageLabel(code: string): string {
		if (code === DEFAULT_AUDIO_LANGUAGE) return ORIGINAL_LANGUAGE;
		return languageOptions.find((option) => option.code === code)?.name ?? ORIGINAL_LANGUAGE;
	}

	function message(section: string): string | null {
		return form && form.section === section && 'message' in form && form.message
			? form.message
			: null;
	}
	function saved(section: string): boolean {
		return !!form && form.section === section && 'saved' in form && !!form.saved;
	}
</script>

<svelte:head>
	<title>Playback · Settings · Finderella</title>
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>Audio</Card.Title>
		<Card.Description>
			Which audio track plays when a title has several, for example a dub and the original language,
			and how many channels you hear.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/updatePlayback" use:enhance>
			<Field.Group>
				<Field.Field data-invalid={message('audio') ? true : undefined}>
					<Field.Label for="audio-language">Preferred audio language</Field.Label>
					<Select.Root type="single" name="audioLanguage" bind:value={audioLanguage}>
						<Select.Trigger id="audio-language" class="w-full sm:w-72">
							{languageLabel(audioLanguage)}
						</Select.Trigger>
						<Select.Content class="max-h-72">
							<Select.Item value={DEFAULT_AUDIO_LANGUAGE} label={ORIGINAL_LANGUAGE} />
							{#each languageOptions as option (option.code)}
								<Select.Item value={option.code} label={option.name} />
							{/each}
						</Select.Content>
					</Select.Root>
					{#if message('audio')}
						<Field.Error>{message('audio')}</Field.Error>
					{:else if saved('audio')}
						<Field.Description>Audio settings saved.</Field.Description>
					{:else}
						<Field.Description>
							Original language plays the track the file marks as its default, which is usually the
							original. A language plays when the title has it, otherwise the default track. Picking
							an audio track in the player updates this too.
						</Field.Description>
					{/if}
				</Field.Field>
				<Field.Field>
					<Field.Label for="audio-channels">Maximum audio channels</Field.Label>
					<Select.Root type="single" name="audioChannels" bind:value={audioChannels}>
						<Select.Trigger id="audio-channels" class="w-full sm:w-72">
							{AUDIO_CHANNEL_LABELS[audioChannels]}
						</Select.Trigger>
						<Select.Content>
							{#each AUDIO_CHANNEL_OPTIONS as option (option)}
								<Select.Item value={option} label={AUDIO_CHANNEL_LABELS[option]} />
							{/each}
						</Select.Content>
					</Select.Root>
					<Field.Description>
						{AUDIO_CHANNEL_LABELS[audioChannels]} – {CHANNEL_DESCRIPTIONS[audioChannels]}
						{#if audioChannels === 'auto' && autoResult}
							<strong class="block font-semibold">On this device: {autoResult}.</strong>
						{:else if audioChannels === 'surround' && surroundDecodable === false}
							<span class="block"
								>This browser can't play 5.1 audio, so you'll hear stereo here.</span
							>
						{/if}
					</Field.Description>
				</Field.Field>
				<Field.Field>
					<Button type="submit" variant="secondary" class="w-fit">Save audio settings</Button>
				</Field.Field>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Series</Card.Title>
		<Card.Description>What happens when an episode ends.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/updateAutoplay" use:enhance>
			<Field.Group>
				<Field.Field orientation="horizontal">
					<Field.Content>
						<Field.Label for="autoplay-next">Play next episode automatically</Field.Label>
						<Field.Description>
							Starts the next episode after a short countdown. The Autoplay switch in the player
							changes this too.
						</Field.Description>
					</Field.Content>
					<!-- The switch carries no form value; the hidden input mirrors it. -->
					<input type="hidden" name="autoplayNext" value={autoplayNext ? 'true' : 'false'} />
					<Switch id="autoplay-next" bind:checked={autoplayNext} />
				</Field.Field>
				{#if message('autoplay')}
					<Field.Error>{message('autoplay')}</Field.Error>
				{:else if saved('autoplay')}
					<Field.Description>Series settings saved.</Field.Description>
				{/if}
				<Field.Field>
					<Button type="submit" variant="secondary" class="w-fit">Save series settings</Button>
				</Field.Field>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Still watching?</Card.Title>
		<Card.Description>
			Pauses playback and asks before carrying on, so nothing keeps playing to an empty room.
			Playback only resumes when you choose to continue.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/updateStillWatching" use:enhance>
			<Field.Group>
				<Field.Field orientation="horizontal">
					<Field.Content>
						<Field.Label for="still-watching">Pause and ask if I'm still watching</Field.Label>
						<Field.Description>
							Any click, tap or key press in the player counts as watching and restarts the count.
						</Field.Description>
					</Field.Content>
					<input
						type="hidden"
						name="stillWatchingEnabled"
						value={stillWatching ? 'true' : 'false'}
					/>
					<Switch id="still-watching" bind:checked={stillWatching} />
				</Field.Field>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field.Field data-disabled={stillWatching ? undefined : true}>
						<Field.Label for="still-watching-episodes">Series: ask after</Field.Label>
						<Select.Root
							type="single"
							name="stillWatchingEpisodes"
							bind:value={stillWatchingEpisodes}
							disabled={!stillWatching}
						>
							<Select.Trigger id="still-watching-episodes" class="w-full">
								{episodesLabel(Number(stillWatchingEpisodes))}
							</Select.Trigger>
							<Select.Content>
								{#each STILL_WATCHING_EPISODES as option (option)}
									<Select.Item value={String(option)} label={episodesLabel(option)} />
								{/each}
							</Select.Content>
						</Select.Root>
						<Field.Description>In a row, played automatically.</Field.Description>
					</Field.Field>
					<Field.Field data-disabled={stillWatching ? undefined : true}>
						<Field.Label for="still-watching-minutes">Movies: ask after</Field.Label>
						<Select.Root
							type="single"
							name="stillWatchingMinutes"
							bind:value={stillWatchingMinutes}
							disabled={!stillWatching}
						>
							<Select.Trigger id="still-watching-minutes" class="w-full">
								{minutesLabel(Number(stillWatchingMinutes))}
							</Select.Trigger>
							<Select.Content>
								{#each STILL_WATCHING_MINUTES as option (option)}
									<Select.Item value={String(option)} label={minutesLabel(option)} />
								{/each}
							</Select.Content>
						</Select.Root>
						<Field.Description>Of playback without any input.</Field.Description>
					</Field.Field>
				</div>
				{#if message('stillWatching')}
					<Field.Error>{message('stillWatching')}</Field.Error>
				{:else if saved('stillWatching')}
					<Field.Description>Still watching settings saved.</Field.Description>
				{/if}
				<Field.Field>
					<Button type="submit" variant="secondary" class="w-fit"
						>Save still watching settings</Button
					>
				</Field.Field>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>
