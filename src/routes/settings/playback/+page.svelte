<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import * as Select from '$lib/components/ui/select';
	import { LANGUAGES } from '@finderella/protocol/languages';
	import { DEFAULT_AUDIO_LANGUAGE } from '$lib/audio-preference';

	let { data, form } = $props();

	let audioLanguage = $derived(data.playbackSettings.audioLanguage);

	const languageOptions = LANGUAGES.map(({ code, name }) => ({ code, name })).toSorted((a, b) =>
		a.name.localeCompare(b.name)
	);
	function languageLabel(code: string): string {
		if (code === DEFAULT_AUDIO_LANGUAGE) return "File's default";
		return languageOptions.find((option) => option.code === code)?.name ?? "File's default";
	}

	const message = $derived(form && 'message' in form && form.message ? form.message : null);
	const saved = $derived(!!form && 'saved' in form && !!form.saved);
</script>

<svelte:head>
	<title>Playback · Settings · Finderella</title>
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>Audio</Card.Title>
		<Card.Description>
			Which audio track plays when a title has several, for example a dub and the original language.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/updatePlayback" use:enhance>
			<Field.Group>
				<Field.Field data-invalid={message ? true : undefined}>
					<Field.Label for="audio-language">Preferred audio language</Field.Label>
					<Select.Root type="single" name="audioLanguage" bind:value={audioLanguage}>
						<Select.Trigger id="audio-language" class="w-full sm:w-72">
							{languageLabel(audioLanguage)}
						</Select.Trigger>
						<Select.Content class="max-h-72">
							<Select.Item value={DEFAULT_AUDIO_LANGUAGE} label="File's default" />
							{#each languageOptions as option (option.code)}
								<Select.Item value={option.code} label={option.name} />
							{/each}
						</Select.Content>
					</Select.Root>
					{#if message}
						<Field.Error>{message}</Field.Error>
					{:else if saved}
						<Field.Description>Playback settings saved.</Field.Description>
					{:else}
						<Field.Description>
							Used when the title has it; otherwise the file's default track. Picking an audio track
							in the player updates it too.
						</Field.Description>
					{/if}
				</Field.Field>
				<Field.Field>
					<Button type="submit" variant="secondary" class="w-fit">Save playback settings</Button>
				</Field.Field>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>
