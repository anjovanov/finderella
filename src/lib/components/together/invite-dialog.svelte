<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import CopyButton from '$lib/components/copy-button.svelte';
	import { togetherHref } from '$lib/data';

	/** The join link for a party, ready to copy. */
	let { code, open = $bindable(false) }: { code: string; open?: boolean } = $props();

	const link = $derived(`${location.origin}${togetherHref(code)}`);

	function selectAll(node: HTMLInputElement) {
		const onFocus = () => node.select();
		node.addEventListener('focus', onFocus);
		return () => node.removeEventListener('focus', onFocus);
	}
</script>

<Dialog.Root bind:open>
	<!-- `dark`: portalled out of the player, but it sits over the video. -->
	<Dialog.Content class="dark sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Invite people to watch together</Dialog.Title>
			<Dialog.Description>
				Anyone with an account on this server can join with this link. Play, pause and skips are
				shared by everyone in the party.
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex items-center gap-2">
			<Input
				value={link}
				readonly
				aria-label="Invite link"
				class="font-mono text-sm"
				{@attach selectAll}
			/>
			<CopyButton text={link} label="Copy link" showLabel variant="default" />
		</div>
	</Dialog.Content>
</Dialog.Root>
