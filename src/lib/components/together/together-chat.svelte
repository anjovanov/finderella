<script lang="ts">
	import { fly } from 'svelte/transition';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Cancel01Icon, SentIcon } from '@hugeicons/core-free-icons';
	import { CHAT_MAX_LENGTH } from '$lib/data/together';
	import type { TogetherSession } from '$lib/together/session.svelte';

	/** The party's chat + feed, as a side panel inside the player. */
	let { party, onclose }: { party: TogetherSession; onclose: () => void } = $props();

	let draft = $state('');

	function send(event: SubmitEvent) {
		event.preventDefault();
		if (!draft.trim()) return;
		party.sendChat(draft);
		draft = '';
	}

	// Keep the newest line in view: re-runs whenever the chat grows.
	function stickToBottom(node: HTMLElement) {
		void party.chat.length;
		node.scrollTop = node.scrollHeight;
	}

	function focusOnMount(node: HTMLInputElement) {
		node.focus({ preventScroll: true });
	}

	const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
</script>

<!-- Bottom-anchored above the control bar; capped height (never past the top bar). -->
<div
	class="together-chat captions-menu absolute right-4 bottom-32 z-20 flex h-[min(28rem,calc(100%-14rem))] w-84 max-w-[calc(100%-2rem)] flex-col sm:right-6"
	role="dialog"
	aria-label="Watch party chat"
	transition:fly={{ x: 16, duration: 200 }}
>
	<div class="flex items-center justify-between px-2 pt-1 pb-2">
		<span class="text-base font-semibold">Chat</span>
		<button
			type="button"
			class="flex size-8 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
			aria-label="Close chat"
			onclick={onclose}
		>
			<HugeiconsIcon icon={Cancel01Icon} class="size-4" />
		</button>
	</div>

	<!-- Thin, translucent scrollbar: the default one is bright white on this dark panel. -->
	<div
		class="min-h-0 flex-1 [scrollbar-width:thin] [scrollbar-color:rgb(255_255_255/0.25)_transparent] overflow-y-auto px-2"
		{@attach stickToBottom}
	>
		{#if party.chat.length === 0}
			<p class="py-6 text-center text-sm text-white/50">Say hi to everyone watching.</p>
		{/if}
		<ul class="flex flex-col gap-2 pb-2">
			{#each party.chat as entry (entry.id)}
				{#if entry.kind === 'event'}
					<li class="text-center text-xs text-white/50">{entry.text}</li>
				{:else}
					<li class="flex flex-col">
						<span class="text-xs text-white/50">
							<span class={entry.participantId === party.me ? 'text-primary' : 'text-white/80'}>
								{entry.participantId === party.me ? 'You' : entry.name}
							</span>
							· {timeFormat.format(entry.at)}
						</span>
						<span class="text-sm break-words whitespace-pre-wrap">{entry.text}</span>
					</li>
				{/if}
			{/each}
		</ul>
	</div>

	<form class="flex items-center gap-2 border-t border-white/10 px-1 pt-2" onsubmit={send}>
		<!-- border-0 + focus:ring-0: @tailwindcss/forms gives text inputs a blue border and ring. -->
		<input
			bind:value={draft}
			type="text"
			maxlength={CHAT_MAX_LENGTH}
			placeholder="Send a message"
			aria-label="Message"
			autocomplete="off"
			class="h-9 min-w-0 flex-1 rounded-full border-0 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/40 focus:ring-0"
			{@attach focusOnMount}
		/>
		<button
			type="submit"
			class="flex size-9 shrink-0 items-center justify-center rounded-full text-primary hover:bg-white/10 disabled:text-white/30"
			aria-label="Send"
			disabled={!draft.trim()}
		>
			<HugeiconsIcon icon={SentIcon} class="size-5.5" />
		</button>
	</form>
</div>
