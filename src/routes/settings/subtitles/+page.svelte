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
	import {
		cueStyle,
		MAX_SUBTITLE_LINES,
		normalizeSubtitleSettings,
		positionLabel,
		SUBTITLE_COLOR_OPTIONS,
		SUBTITLE_FONT_OPTIONS,
		SUBTITLE_SIZE_OPTIONS
	} from '$lib/data/subtitle-settings';

	let { data, form } = $props();

	// Every control saves itself as it changes; `form` only reports a no-JS post.
	const saver = new SettingsSaver('?/updateSubtitles');

	// Subtitle form state: seeded from the saved settings, edited live for the preview.
	let subLanguage = $derived(data.subtitleSettings.language);
	let subSize = $derived(data.subtitleSettings.size);
	let subColor = $derived(data.subtitleSettings.color);
	let subBackground = $derived(data.subtitleSettings.background);
	let subPosition = $derived(data.subtitleSettings.position);
	let subFont = $derived(data.subtitleSettings.font);
	const previewSettings = $derived(
		normalizeSubtitleSettings({
			language: subLanguage,
			size: subSize,
			color: subColor,
			background: subBackground,
			position: subPosition,
			font: subFont
		})
	);

	const languageOptions = LANGUAGES.map(({ code, name }) => ({ code, name })).toSorted((a, b) =>
		a.name.localeCompare(b.name)
	);
	function languageLabel(code: string): string {
		if (code === 'off') return 'Off';
		return languageOptions.find((option) => option.code === code)?.name ?? 'English';
	}
	function optionLabel(options: { value: string; label: string }[], value: string): string {
		return options.find((option) => option.value === value)?.label ?? value;
	}

	const message = $derived(form && 'message' in form && form.message ? form.message : null);
	const saved = $derived(!!form && 'saved' in form && !!form.saved);
</script>

<PageTitle title="Subtitles · Settings" />

<Card.Root>
	<Card.Header>
		<Card.Title>Subtitles</Card.Title>
		<Card.Description>
			Which language turns on automatically, and how subtitles look in the player.
			<span class="block"
				>Picking a language from the player's menu updates the preference too.</span
			>
		</Card.Description>
		<Card.Action><SaveStatus {saver} /></Card.Action>
	</Card.Header>
	<Card.Content>
		<!-- autocomplete="off": no restoring stale picks on reload (see CLAUDE.md). -->
		<form method="POST" action="?/updateSubtitles" autocomplete="off">
			<Field.Group>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field.Field>
						<Field.Label for="subtitle-language">Preferred language</Field.Label>
						<Select.Root
							type="single"
							name="language"
							bind:value={subLanguage}
							onValueChange={(language) => saver.save({ language })}
						>
							<Select.Trigger id="subtitle-language" class="w-full">
								{languageLabel(subLanguage)}
							</Select.Trigger>
							<Select.Content class="max-h-72">
								<Select.Item value="off" label="Off" />
								{#each languageOptions as option (option.code)}
									<Select.Item value={option.code} label={option.name} />
								{/each}
							</Select.Content>
						</Select.Root>
						<Field.Description>
							Shown when the title has it; otherwise the file's default track, if any.
						</Field.Description>
					</Field.Field>
					<Field.Field>
						<Field.Label for="subtitle-size">Text size</Field.Label>
						<Select.Root
							type="single"
							name="size"
							bind:value={subSize}
							onValueChange={(size) => saver.save({ size })}
						>
							<Select.Trigger id="subtitle-size" class="w-full">
								{optionLabel(SUBTITLE_SIZE_OPTIONS, subSize)}
							</Select.Trigger>
							<Select.Content>
								{#each SUBTITLE_SIZE_OPTIONS as option (option.value)}
									<Select.Item value={option.value} label={option.label} />
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
					<Field.Field>
						<Field.Label for="subtitle-color">Text color</Field.Label>
						<Select.Root
							type="single"
							name="color"
							bind:value={subColor}
							onValueChange={(color) => saver.save({ color })}
						>
							<Select.Trigger id="subtitle-color" class="w-full">
								<span class="size-3 rounded-full ring-1 ring-border" style="background: {subColor}"
								></span>
								{optionLabel(SUBTITLE_COLOR_OPTIONS, subColor)}
							</Select.Trigger>
							<Select.Content>
								{#each SUBTITLE_COLOR_OPTIONS as option (option.value)}
									<Select.Item value={option.value} label={option.label}>
										<span
											class="size-3 rounded-full ring-1 ring-border"
											style="background: {option.value}"
										></span>
										{option.label}
									</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
					<Field.Field>
						<Field.Label for="subtitle-font">Font</Field.Label>
						<Select.Root
							type="single"
							name="font"
							bind:value={subFont}
							onValueChange={(font) => saver.save({ font })}
						>
							<Select.Trigger id="subtitle-font" class="w-full">
								{optionLabel(SUBTITLE_FONT_OPTIONS, subFont)}
							</Select.Trigger>
							<Select.Content>
								{#each SUBTITLE_FONT_OPTIONS as option (option.value)}
									<Select.Item value={option.value} label={option.label} />
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
					<Field.Field orientation="horizontal" class="sm:col-span-2">
						<Field.Content>
							<Field.Label for="subtitle-background">Text background</Field.Label>
							<Field.Description>
								A dark box behind the text. Off shows the text over the picture with a shadow.
							</Field.Description>
						</Field.Content>
						<!-- The switch carries no form value; the hidden input mirrors it. -->
						<input type="hidden" name="background" value={subBackground ? 'true' : 'false'} />
						<Switch
							id="subtitle-background"
							bind:checked={subBackground}
							onCheckedChange={(background) => saver.save({ background })}
						/>
					</Field.Field>
					<Field.Field class="sm:col-span-2">
						<div class="flex items-baseline justify-between gap-4">
							<Field.Label for="subtitle-position">Vertical position</Field.Label>
							<span class="text-sm text-muted-foreground tabular-nums">
								{positionLabel(subPosition)}
							</span>
						</div>
						<input
							id="subtitle-position"
							name="position"
							type="range"
							min="0"
							max={MAX_SUBTITLE_LINES}
							step="1"
							bind:value={subPosition}
							onchange={(event) => saver.save({ position: event.currentTarget.value })}
							class="w-full accent-primary"
							aria-valuetext={positionLabel(subPosition)}
						/>
						<Field.Description
							>How many lines above the bottom edge the text sits.</Field.Description
						>
					</Field.Field>
				</div>

				<!-- Preview: the same custom properties the player's ::cue rule reads. -->
				<Field.Field>
					<Field.Label>Preview</Field.Label>
					<!-- A 16:9 scale model of the player viewport: the cue is the same fraction of
					     the box height as in the player (cqh ≙ vh) and moves in whole cue lines. -->
					<div
						class="relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-border"
						style="container-type: size; {cueStyle(previewSettings)}"
						aria-hidden="true"
					>
						<div
							class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(255_255_255/0.08),transparent_65%)]"
						></div>
						<div
							class="absolute inset-x-0 flex justify-center"
							style="font-size: calc(var(--cue-size-pct) * 1cqh); line-height: 1.2; bottom: calc({previewSettings.position} * 1.2em)"
						>
							<span
								class="max-w-[80%] px-[0.3em] py-[0.1em] text-center"
								style="color: var(--cue-color); font-family: var(--cue-font); text-shadow: var(--cue-shadow); background: var(--cue-background)"
							>
								Where are we going?<br />Somewhere quiet, I hope.
							</span>
						</div>
					</div>
					<Field.Description>
						Approximate: a 16:9 model of the player. Exact placement depends on the browser and the
						video's aspect ratio.
					</Field.Description>
					{#if message}
						<Field.Error>{message}</Field.Error>
					{:else if saved}
						<Field.Description>Subtitle settings saved.</Field.Description>
					{/if}
				</Field.Field>
				<noscript>
					<Button type="submit" variant="secondary" class="w-fit">Save subtitle settings</Button>
				</noscript>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>
