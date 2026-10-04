<script lang="ts">
	import { branding } from '$lib/branding';
	import { accentPreset } from '$lib/data/branding';
	import PageTitle from '$lib/components/page-title.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Moon02Icon, Sun03Icon } from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import SaveStatus from '$lib/components/save-status.svelte';
	import { SettingsSaver } from '$lib/settings-saver.svelte';
	import {
		SCREENSAVER_KIND_OPTIONS,
		SCREENSAVER_TIMEOUTS,
		timeoutLabel,
		type Theme
	} from '$lib/data/preferences';
	import { getScreensaver } from '$lib/screensaver.svelte';

	let { data, form } = $props();

	// Every control saves itself as it changes; `form` only reports a no-JS post.
	// Both re-run the loads after saving: the root layout applies the theme and
	// runs the screensaver from its own copy of these preferences.
	const appearance = new SettingsSaver('?/updateAppearance', { invalidate: true });
	const screensaverSaver = new SettingsSaver('?/updateScreensaver', { invalidate: true });

	const screensaver = getScreensaver();

	let theme = $derived(data.preferences.theme);
	let enabled = $derived(data.preferences.screensaver.enabled);
	let kind = $derived(data.preferences.screensaver.kind);
	let seconds = $derived(String(data.preferences.screensaver.seconds));

	// Literal colors, not tokens: each tile previews its theme whatever the current
	// one is (the accent is the hub's branding preset in that theme).
	const accent = $derived(accentPreset(branding().accent));
	const themes: { value: Theme; label: string; icon: typeof Moon02Icon; swatch: string[] }[] =
		$derived([
			{
				value: 'dark',
				label: 'Dark',
				icon: Moon02Icon,
				swatch: ['#101014', '#1d2126', accent.dark.primary]
			},
			{
				value: 'light',
				label: 'Light',
				icon: Sun03Icon,
				swatch: ['#f8fafb', '#e9eef1', accent.light.primary]
			}
		]);

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

<PageTitle title="Preferences · Settings" />

<Card.Root>
	<Card.Header>
		<Card.Title>Appearance</Card.Title>
		<Card.Description>
			How {branding().appName} looks for this profile, on every device. The player always stays dark.
		</Card.Description>
		<Card.Action><SaveStatus saver={appearance} /></Card.Action>
	</Card.Header>
	<Card.Content>
		<!-- autocomplete="off" on these forms: no restoring stale picks on reload (see CLAUDE.md). -->
		<form method="POST" action="?/updateAppearance" autocomplete="off">
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
							onchange={(event) => appearance.save({ theme: event.currentTarget.value })}
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
		<Card.Action><SaveStatus saver={screensaverSaver} /></Card.Action>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/updateScreensaver" autocomplete="off">
			<Field.Group>
				<Field.Field orientation="horizontal">
					<Field.Content>
						<Field.Label for="screensaver-enabled">Show a screensaver when idle</Field.Label>
					</Field.Content>
					<!-- The switch carries no form value; the hidden input mirrors it. -->
					<input type="hidden" name="screensaverEnabled" value={enabled ? 'true' : 'false'} />
					<Switch
						id="screensaver-enabled"
						bind:checked={enabled}
						onCheckedChange={(screensaverEnabled) => screensaverSaver.save({ screensaverEnabled })}
					/>
				</Field.Field>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field.Field data-disabled={enabled ? undefined : true}>
						<Field.Label for="screensaver-kind">Show</Field.Label>
						<Select.Root
							type="single"
							name="screensaverKind"
							bind:value={kind}
							onValueChange={(screensaverKind) => screensaverSaver.save({ screensaverKind })}
							disabled={!enabled}
						>
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
							onValueChange={(screensaverSeconds) => screensaverSaver.save({ screensaverSeconds })}
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
					<noscript>
						<Button type="submit" variant="secondary" class="w-fit"
							>Save screensaver settings</Button
						>
					</noscript>
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
