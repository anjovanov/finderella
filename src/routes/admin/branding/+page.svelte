<script lang="ts">
	import PageTitle from '$lib/components/page-title.svelte';
	import { enhance } from '$app/forms';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import {
		ACCENT_PRESETS,
		APP_NAME_MAX,
		BODY_FONTS,
		DEFAULT_BRANDING,
		HEADING_FONTS,
		TAGLINE_MAX,
		brandStyleVars,
		fontOption,
		type AccentId,
		type FontId
	} from '$lib/data/branding';
	import { DialogForm } from '$lib/dialog-form.svelte';

	let { data, form } = $props();

	// Form state starts from the saved branding and follows it after a save/reset.
	let appName = $derived(data.branding.appName);
	let tagline = $derived(data.branding.tagline ?? '');
	let accent = $derived<AccentId>(data.branding.accent);
	let bodyFont = $derived<FontId>(data.branding.bodyFont);
	let headingFont = $derived<FontId>(data.branding.headingFont);
	let saving = $state(false);

	const reset = new DialogForm();
	const isDefault = $derived(
		data.branding.appName === DEFAULT_BRANDING.appName &&
			data.branding.tagline === DEFAULT_BRANDING.tagline &&
			data.branding.accent === DEFAULT_BRANDING.accent &&
			data.branding.bodyFont === DEFAULT_BRANDING.bodyFont &&
			data.branding.headingFont === DEFAULT_BRANDING.headingFont
	);

	// The preview panels carry their own theme surfaces (the admin page itself
	// may be either theme) plus the unsaved branding's tokens; values mirror
	// layout.css.
	const SURFACES = {
		light: {
			'--background': 'oklch(0.985 0.004 230)',
			'--foreground': 'oklch(0.2 0.02 230)',
			'--muted-foreground': 'oklch(0.5 0.015 230)',
			'--border': 'oklch(0.9 0.008 230)'
		},
		dark: {
			'--background': 'oklch(0.13 0.01 230)',
			'--foreground': 'oklch(0.97 0.005 230)',
			'--muted-foreground': 'oklch(0.72 0.01 230)',
			'--border': 'oklch(1 0 0 / 10%)'
		}
	} as const;

	const MODES = ['light', 'dark'] as const;

	function previewStyle(mode: 'light' | 'dark'): string {
		const vars = { ...SURFACES[mode], ...brandStyleVars({ accent, bodyFont, headingFont }, mode) };
		return Object.entries(vars)
			.map(([name, value]) => `${name}: ${value}`)
			.join('; ');
	}
</script>

<PageTitle title="Branding" />

<div>
	<h1 class="text-2xl font-semibold">Branding</h1>
	<p class="text-sm text-muted-foreground">
		The name, colours and fonts everyone sees on this server. Viewers still pick light or dark per
		profile.
	</p>
</div>

<div class="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
	<!-- autocomplete="off" stops the browser restoring the fields on reload: Svelte
	     keeps a restored radio / the Select's hidden input over the server's value
	     while hydrating, so the form would show stale picks, not the saved branding. -->
	<form
		method="POST"
		action="?/save"
		autocomplete="off"
		class="flex flex-col gap-8"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				await update({ reset: false });
			};
		}}
	>
		<Card.Root>
			<Card.Header>
				<Card.Title>Identity</Card.Title>
				<Card.Description>
					Shown in the navigation, page titles, the screensaver and on the sign-in page.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Field.Group>
					<Field.Field>
						<Field.Label for="brand-name">Name</Field.Label>
						<Input
							id="brand-name"
							name="appName"
							autocomplete="off"
							maxlength={APP_NAME_MAX}
							required
							bind:value={appName}
						/>
					</Field.Field>
					<Field.Field>
						<Field.Label for="brand-tagline">Tagline</Field.Label>
						<Input
							id="brand-tagline"
							name="tagline"
							autocomplete="off"
							maxlength={TAGLINE_MAX}
							placeholder="Optional"
							bind:value={tagline}
						/>
						<Field.Description>
							A line under the name on the sign-in and create-account pages.
						</Field.Description>
					</Field.Field>
				</Field.Group>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Accent colour</Card.Title>
				<Card.Description>
					Buttons, links, highlights and the player's progress bar. Each colour comes in a tuned
					shade for the light and the dark theme.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<fieldset>
					<legend class="sr-only">Accent colour</legend>
					<div class="grid grid-cols-4 gap-3 sm:grid-cols-8">
						{#each ACCENT_PRESETS as preset (preset.value)}
							<label
								class="group flex cursor-pointer flex-col items-center gap-2 rounded-lg p-2 text-xs transition-colors hover:bg-muted has-checked:bg-muted has-checked:font-medium"
							>
								<span
									class="size-10 rounded-full ring-offset-2 ring-offset-background group-has-checked:ring-2 group-has-checked:ring-foreground group-has-focus-visible:ring-2 group-has-focus-visible:ring-ring"
									style:background="linear-gradient(135deg, {preset.light.primary} 50%, {preset.dark
										.primary} 50%)"
								></span>
								<input
									type="radio"
									name="accent"
									value={preset.value}
									bind:group={accent}
									class="sr-only"
								/>
								{preset.label}
							</label>
						{/each}
					</div>
				</fieldset>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Typography</Card.Title>
				<Card.Description>
					Fonts are served by this server. Display fonts are for headings only.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Field.Group class="grid gap-6 sm:grid-cols-2">
					<Field.Field>
						<Field.Label for="brand-body-font">Body font</Field.Label>
						<Select.Root type="single" name="bodyFont" bind:value={bodyFont}>
							<Select.Trigger id="brand-body-font" class="w-full">
								<span style:font-family={fontOption(bodyFont).family}>
									{fontOption(bodyFont).label}
								</span>
							</Select.Trigger>
							<Select.Content>
								{#each BODY_FONTS as font (font.value)}
									<Select.Item value={font.value} label={font.label}>
										<span style:font-family={font.family}>{font.label}</span>
									</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
					<Field.Field>
						<Field.Label for="brand-heading-font">Heading font</Field.Label>
						<Select.Root type="single" name="headingFont" bind:value={headingFont}>
							<Select.Trigger id="brand-heading-font" class="w-full">
								<span style:font-family={fontOption(headingFont).family}>
									{fontOption(headingFont).label}
								</span>
							</Select.Trigger>
							<Select.Content>
								{#each HEADING_FONTS as font (font.value)}
									<Select.Item value={font.value} label={font.label}>
										<span style:font-family={font.family}>{font.label}</span>
									</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
				</Field.Group>
			</Card.Content>
		</Card.Root>

		<div class="flex flex-wrap items-center gap-3">
			<Button type="submit" disabled={saving}>Save branding</Button>
			<Button
				type="button"
				variant="ghost"
				disabled={saving || isDefault}
				onclick={() => reset.show()}
			>
				Reset to defaults
			</Button>
			{#if form && 'brandingError' in form}
				<Field.Error>{form.brandingError}</Field.Error>
			{:else if form && 'brandingSaved' in form}
				<Field.Description>Branding saved.</Field.Description>
			{:else if form && 'brandingReset' in form}
				<Field.Description>Branding reset to the defaults.</Field.Description>
			{/if}
		</div>
	</form>

	<Card.Root class="lg:sticky lg:top-22">
		<Card.Header>
			<Card.Title>Preview</Card.Title>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#each MODES as mode (mode)}
				<div
					class="flex flex-col gap-4 rounded-lg border border-border bg-background p-5 font-sans text-foreground"
					style={previewStyle(mode)}
					aria-label="{mode === 'light' ? 'Light' : 'Dark'} theme preview"
					role="img"
				>
					<span
						class="truncate font-heading text-sm font-bold tracking-[0.25em] text-primary uppercase"
					>
						{appName.trim() || DEFAULT_BRANDING.appName}
					</span>
					<div class="flex flex-col gap-1">
						<h3 class="text-xl font-semibold">Continue watching</h3>
						<p class="text-sm text-muted-foreground">
							Pick up where you left off, on any device.
							<span class="text-primary underline underline-offset-4">See all</span>
						</p>
					</div>
					<div class="flex items-center gap-3">
						<span
							class="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
						>
							Play
						</span>
						<span
							class="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm ring-3 ring-ring/50"
						>
							Focused
						</span>
					</div>
					<div class="h-1 overflow-hidden rounded-full bg-foreground/15">
						<div class="h-full w-2/5 rounded-full bg-primary"></div>
					</div>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
</div>

<AlertDialog.Root bind:open={reset.open}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Reset branding?</AlertDialog.Title>
			<AlertDialog.Description>
				The name goes back to {DEFAULT_BRANDING.appName}, the tagline is removed, and the teal
				accent and Figtree font return.
			</AlertDialog.Description>
		</AlertDialog.Header>
		{#if reset.error}<p class="text-sm text-destructive">{reset.error}</p>{/if}
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<form method="POST" action="?/reset" use:enhance={reset.submit}>
				<Button type="submit" variant="destructive" class="w-full" disabled={reset.busy}>
					Reset
				</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
