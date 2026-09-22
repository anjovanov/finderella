<script lang="ts">
	import { enhance } from '$app/forms';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Moon02Icon, Sun03Icon } from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import {
		SCREENSAVER_KIND_OPTIONS,
		SCREENSAVER_TIMEOUTS,
		timeoutLabel,
		type Theme
	} from '$lib/data/preferences';
	import { getScreensaver } from '$lib/screensaver.svelte';

	let { data, form } = $props();

	const screensaver = getScreensaver();

	let theme = $derived(data.preferences.theme);
	let enabled = $derived(data.preferences.screensaver.enabled);
	let kind = $derived(data.preferences.screensaver.kind);
	let seconds = $derived(String(data.preferences.screensaver.seconds));

	// Literal colors, not tokens: each tile previews its theme whatever the current one is.
	const themes: { value: Theme; label: string; icon: typeof Moon02Icon; swatch: string[] }[] = [
		{
			value: 'dark',
			label: 'Dark',
			icon: Moon02Icon,
			swatch: ['#101014', '#1d2126', '#6ccde0']
		},
		{
			value: 'light',
			label: 'Light',
			icon: Sun03Icon,
			swatch: ['#f8fafb', '#e9eef1', '#1f8aa0']
		}
	];

	function kindLabel(value: string): string {
		return SCREENSAVER_KIND_OPTIONS.find((option) => option.value === value)?.label ?? value;
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
	<title>Preferences · Settings · Finderella</title>
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>Appearance</Card.Title>
		<Card.Description>
			How Finderella looks on your devices. The player always stays dark.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<!-- Saves on change, so the new theme applies straight away. -->
		<form method="POST" action="?/updateAppearance" use:enhance>
			<fieldset class="grid grid-cols-2 gap-3 sm:max-w-md">
				<legend class="sr-only">Theme</legend>
				{#each themes as option (option.value)}
					<label
						class={[
							'flex cursor-pointer flex-col gap-3 rounded-2xl border p-3 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring',
							theme === option.value
								? 'border-primary bg-primary/5'
								: 'border-border hover:bg-muted/60'
						]}
					>
						<input
							type="radio"
							name="theme"
							value={option.value}
							bind:group={theme}
							class="sr-only"
							onchange={(event) => event.currentTarget.form?.requestSubmit()}
						/>
						<span
							class="flex aspect-[16/10] flex-col gap-1.5 rounded-lg p-2 ring-1 ring-black/10"
							style:background={option.swatch[0]}
							aria-hidden="true"
						>
							<span class="h-1.5 w-1/3 rounded-full" style:background={option.swatch[2]}></span>
							<span class="flex flex-1 gap-1.5">
								<span class="flex-1 rounded-md" style:background={option.swatch[1]}></span>
								<span class="flex-1 rounded-md" style:background={option.swatch[1]}></span>
								<span class="flex-1 rounded-md" style:background={option.swatch[1]}></span>
							</span>
						</span>
						<span class="flex items-center gap-2 text-sm font-medium">
							<HugeiconsIcon icon={option.icon} class="size-4" />
							{option.label}
						</span>
					</label>
				{/each}
			</fieldset>
			{#if message('appearance')}
				<p class="mt-3 text-sm text-destructive">{message('appearance')}</p>
			{/if}
			<noscript>
				<Button type="submit" variant="secondary" class="mt-3 w-fit">Save theme</Button>
			</noscript>
		</form>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Screensaver</Card.Title>
		<Card.Description>
			Shown after a while without mouse, keyboard or touch input — never over the player or a
			trailer. Any input brings you back.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/updateScreensaver" use:enhance>
			<Field.Group>
				<Field.Field orientation="horizontal">
					<Field.Content>
						<Field.Label for="screensaver-enabled">Show a screensaver when idle</Field.Label>
					</Field.Content>
					<!-- The switch carries no form value; the hidden input mirrors it. -->
					<input type="hidden" name="screensaverEnabled" value={enabled ? 'true' : 'false'} />
					<Switch id="screensaver-enabled" bind:checked={enabled} />
				</Field.Field>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field.Field data-disabled={enabled ? undefined : true}>
						<Field.Label for="screensaver-kind">Show</Field.Label>
						<Select.Root type="single" name="screensaverKind" bind:value={kind} disabled={!enabled}>
							<Select.Trigger id="screensaver-kind" class="w-full">
								{kindLabel(kind)}
							</Select.Trigger>
							<Select.Content>
								{#each SCREENSAVER_KIND_OPTIONS as option (option.value)}
									<Select.Item value={option.value} label={option.label} />
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
					<Field.Field data-disabled={enabled ? undefined : true}>
						<Field.Label for="screensaver-seconds">Start after</Field.Label>
						<Select.Root
							type="single"
							name="screensaverSeconds"
							bind:value={seconds}
							disabled={!enabled}
						>
							<Select.Trigger id="screensaver-seconds" class="w-full">
								{timeoutLabel(Number(seconds))}
							</Select.Trigger>
							<Select.Content>
								{#each SCREENSAVER_TIMEOUTS as option (option)}
									<Select.Item value={String(option)} label={timeoutLabel(option)} />
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
				</div>
				{#if message('screensaver')}
					<Field.Error>{message('screensaver')}</Field.Error>
				{:else if saved('screensaver')}
					<Field.Description>Screensaver settings saved.</Field.Description>
				{/if}
				<Field.Field orientation="horizontal" class="w-fit">
					<Button type="submit" variant="secondary" class="w-fit">Save screensaver settings</Button>
					<Button
						type="button"
						variant="ghost"
						class="w-fit"
						onclick={() => screensaver.show(kind)}
					>
						Preview
					</Button>
				</Field.Field>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>
