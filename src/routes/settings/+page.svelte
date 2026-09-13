<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import PasswordInput from '$lib/components/password-input.svelte';
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

	const joined = $derived(new Date(data.account.createdAt).toLocaleDateString());

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
	<title>Settings · Finderella</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl page-gutter flex-col gap-8 py-10">
	<div>
		<h1 class="text-2xl font-semibold">Settings</h1>
		<p class="text-sm text-muted-foreground">Your account on this Finderella server.</p>
	</div>

	<!-- Profile -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Profile</Card.Title>
			<Card.Description>
				<span class="inline-flex flex-wrap items-center gap-2">
					<Badge variant={data.account.isAdmin ? 'default' : 'secondary'}>
						{data.account.isAdmin ? 'Administrator' : 'User'}
					</Badge>
					<span>Member since {joined}</span>
				</span>
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/updateName" use:enhance>
				<Field.Group>
					<Field.Field data-invalid={message('profile') ? true : undefined}>
						<Field.Label for="name">Display name</Field.Label>
						<Input
							id="name"
							name="name"
							value={data.account.name}
							autocomplete="name"
							aria-invalid={message('profile') ? true : undefined}
							required
						/>
						{#if message('profile')}
							<Field.Error>{message('profile')}</Field.Error>
						{:else if saved('profile')}
							<Field.Description>Name updated.</Field.Description>
						{/if}
					</Field.Field>
					<Field.Field>
						<Button type="submit" variant="secondary" class="w-fit">Save name</Button>
					</Field.Field>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Email -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Email address</Card.Title>
			<Card.Description>You sign in with this address.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/updateEmail" use:enhance>
				<Field.Group>
					<Field.Field data-invalid={message('email') ? true : undefined}>
						<Field.Label for="email">Email</Field.Label>
						<Input
							id="email"
							name="email"
							type="email"
							value={data.account.email}
							autocomplete="email"
							aria-invalid={message('email') ? true : undefined}
							required
						/>
						{#if message('email')}
							<Field.Error>{message('email')}</Field.Error>
						{:else if saved('email')}
							<Field.Description>Email updated.</Field.Description>
						{/if}
					</Field.Field>
					<Field.Field>
						<Button type="submit" variant="secondary" class="w-fit">Save email</Button>
					</Field.Field>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Subtitles -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Subtitles</Card.Title>
			<Card.Description>
				Which language turns on automatically, and how subtitles look in the player. Picking a
				language from the player's menu updates the preference too.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/updateSubtitles" use:enhance>
				<Field.Group>
					<div class="grid gap-4 sm:grid-cols-2">
						<Field.Field>
							<Field.Label for="subtitle-language">Preferred language</Field.Label>
							<Select.Root type="single" name="language" bind:value={subLanguage}>
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
							<Select.Root type="single" name="size" bind:value={subSize}>
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
							<Select.Root type="single" name="color" bind:value={subColor}>
								<Select.Trigger id="subtitle-color" class="w-full">
									<span
										class="size-3 rounded-full ring-1 ring-border"
										style="background: {subColor}"
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
							<Select.Root type="single" name="font" bind:value={subFont}>
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
							<Switch id="subtitle-background" bind:checked={subBackground} />
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
							Approximate: a 16:9 model of the player. Exact placement depends on the browser and
							the video's aspect ratio.
						</Field.Description>
						{#if message('subtitles')}
							<Field.Error>{message('subtitles')}</Field.Error>
						{:else if saved('subtitles')}
							<Field.Description>Subtitle settings saved.</Field.Description>
						{/if}
					</Field.Field>
					<Field.Field>
						<Button type="submit" variant="secondary" class="w-fit">Save subtitle settings</Button>
					</Field.Field>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Password -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Password</Card.Title>
			<Card.Description>Changing it signs you out everywhere else.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/changePassword" use:enhance>
				<Field.Group>
					<Field.Field>
						<Field.Label for="current-password">Current password</Field.Label>
						<PasswordInput
							id="current-password"
							name="currentPassword"
							autocomplete="current-password"
							required
						/>
					</Field.Field>
					<Field.Field data-invalid={message('password') ? true : undefined}>
						<Field.Label for="new-password">New password</Field.Label>
						<PasswordInput
							id="new-password"
							name="newPassword"
							autocomplete="new-password"
							minlength={8}
							aria-invalid={message('password') ? true : undefined}
							required
						/>
						{#if message('password')}
							<Field.Error>{message('password')}</Field.Error>
						{:else if saved('password')}
							<Field.Description>Password changed.</Field.Description>
						{:else}
							<Field.Description>At least 8 characters.</Field.Description>
						{/if}
					</Field.Field>
					<Field.Field>
						<Button type="submit" variant="secondary" class="w-fit">Change password</Button>
					</Field.Field>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>
</div>
