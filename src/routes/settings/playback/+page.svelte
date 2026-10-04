<script lang="ts">
	import PageTitle from '$lib/components/page-title.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import SaveStatus from '$lib/components/save-status.svelte';
	import { SettingsSaver } from '$lib/settings-saver.svelte';
	import { LANGUAGES } from '@finderella/protocol/languages';
	import { DEFAULT_AUDIO_LANGUAGE } from '$lib/audio-preference';
	import { canDecodeSurround, detectOutputChannels } from '$lib/audio-output';
	import { SKIP_MODE_LABELS, SKIP_MODES, type SkipMode } from '$lib/data/markers';
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

	// Every control saves itself as it changes (one action per card); `form`
	// only reports a no-JS post.
	const audio = new SettingsSaver('?/updatePlayback');
	const skip = new SettingsSaver('?/updateSkip');
	const autoplay = new SettingsSaver('?/updateAutoplay');
	const stillWatchingSaver = new SettingsSaver('?/updateStillWatching');

	let audioLanguage = $derived(data.playbackSettings.audioLanguage);
	let audioChannels = $derived(data.playbackSettings.audioChannels);
	let autoplayNext = $derived(data.playbackSettings.autoplayNext);
	let skipIntro = $derived<SkipMode>(data.playbackSettings.skipIntro);
	let skipCredits = $derived<SkipMode>(data.playbackSettings.skipCredits);
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

	// Explains the selected option of each skip select.
	const INTRO_DESCRIPTIONS: Record<SkipMode, string> = {
		show: 'A Skip intro button appears while the intro plays.',
		auto: 'Intros are skipped as soon as they start, with a moment to undo. Intros that were only guessed still get a button.',
		off: 'Intros play without a button.'
	};
	const CREDITS_DESCRIPTIONS: Record<SkipMode, string> = {
		show: 'A button appears when the credits start: Next episode for series, Skip credits otherwise.',
		auto: 'Series move on to the next episode when the credits start (with autoplay on); credits followed by a scene are skipped. Movies still just get a button.',
		off: 'Credits play without a button; the next episode starts once the episode ends.'
	};

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

<PageTitle title="Playback · Settings" />

<Card.Root>
	<Card.Header>
		<Card.Title>Audio</Card.Title>
		<Card.Description>
			Which audio track plays when a title has several, for example a dub and the original language,
			and how many channels you hear.
		</Card.Description>
		<Card.Action><SaveStatus saver={audio} /></Card.Action>
	</Card.Header>
	<Card.Content>
		<!-- autocomplete="off" on these forms: no restoring stale picks on reload (see CLAUDE.md). -->
		<form method="POST" action="?/updatePlayback" autocomplete="off">
			<Field.Group>
				<Field.Field data-invalid={message('audio') ? true : undefined}>
					<Field.Label for="audio-language">Preferred audio language</Field.Label>
					<Select.Root
						type="single"
						name="audioLanguage"
						bind:value={audioLanguage}
						onValueChange={(audioLanguage) => audio.save({ audioLanguage })}
					>
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
					<Select.Root
						type="single"
						name="audioChannels"
						bind:value={audioChannels}
						onValueChange={(audioChannels) => audio.save({ audioChannels })}
					>
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
				<noscript>
					<Button type="submit" variant="secondary" class="w-fit">Save audio settings</Button>
				</noscript>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Skip intro & credits</Card.Title>
		<Card.Description>
			What happens when an intro or the closing credits start. Titles are analysed after they're
			added, so new ones may take a while to get these.
		</Card.Description>
		<Card.Action><SaveStatus saver={skip} /></Card.Action>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/updateSkip" autocomplete="off">
			<Field.Group>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field.Field>
						<Field.Label for="skip-intro">Intros</Field.Label>
						<Select.Root
							type="single"
							name="skipIntro"
							bind:value={skipIntro}
							onValueChange={(skipIntro) => skip.save({ skipIntro })}
						>
							<Select.Trigger id="skip-intro" class="w-full">
								{SKIP_MODE_LABELS[skipIntro]}
							</Select.Trigger>
							<Select.Content>
								{#each SKIP_MODES as mode (mode)}
									<Select.Item value={mode} label={SKIP_MODE_LABELS[mode]} />
								{/each}
							</Select.Content>
						</Select.Root>
						<Field.Description>{INTRO_DESCRIPTIONS[skipIntro]}</Field.Description>
					</Field.Field>
					<Field.Field>
						<Field.Label for="skip-credits">Credits</Field.Label>
						<Select.Root
							type="single"
							name="skipCredits"
							bind:value={skipCredits}
							onValueChange={(skipCredits) => skip.save({ skipCredits })}
						>
							<Select.Trigger id="skip-credits" class="w-full">
								{SKIP_MODE_LABELS[skipCredits]}
							</Select.Trigger>
							<Select.Content>
								{#each SKIP_MODES as mode (mode)}
									<Select.Item value={mode} label={SKIP_MODE_LABELS[mode]} />
								{/each}
							</Select.Content>
						</Select.Root>
						<Field.Description>{CREDITS_DESCRIPTIONS[skipCredits]}</Field.Description>
					</Field.Field>
				</div>
				{#if message('skip')}
					<Field.Error>{message('skip')}</Field.Error>
				{:else if saved('skip')}
					<Field.Description>Skip settings saved.</Field.Description>
				{/if}
				<noscript>
					<Button type="submit" variant="secondary" class="w-fit">Save skip settings</Button>
				</noscript>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Series</Card.Title>
		<Card.Description>What happens when an episode ends.</Card.Description>
		<Card.Action><SaveStatus saver={autoplay} /></Card.Action>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/updateAutoplay" autocomplete="off">
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
					<Switch
						id="autoplay-next"
						bind:checked={autoplayNext}
						onCheckedChange={(autoplayNext) => autoplay.save({ autoplayNext })}
					/>
				</Field.Field>
				{#if message('autoplay')}
					<Field.Error>{message('autoplay')}</Field.Error>
				{:else if saved('autoplay')}
					<Field.Description>Series settings saved.</Field.Description>
				{/if}
				<noscript>
					<Button type="submit" variant="secondary" class="w-fit">Save series settings</Button>
				</noscript>
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
		<Card.Action><SaveStatus saver={stillWatchingSaver} /></Card.Action>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/updateStillWatching" autocomplete="off">
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
					<Switch
						id="still-watching"
						bind:checked={stillWatching}
						onCheckedChange={(stillWatchingEnabled) =>
							stillWatchingSaver.save({ stillWatchingEnabled })}
					/>
				</Field.Field>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field.Field data-disabled={stillWatching ? undefined : true}>
						<Field.Label for="still-watching-episodes">Series: ask after</Field.Label>
						<Select.Root
							type="single"
							name="stillWatchingEpisodes"
							bind:value={stillWatchingEpisodes}
							onValueChange={(stillWatchingEpisodes) =>
								stillWatchingSaver.save({ stillWatchingEpisodes })}
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
							onValueChange={(stillWatchingMinutes) =>
								stillWatchingSaver.save({ stillWatchingMinutes })}
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
				<noscript>
					<Button type="submit" variant="secondary" class="w-fit"
						>Save still watching settings</Button
					>
				</noscript>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>
