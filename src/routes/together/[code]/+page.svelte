<script lang="ts">
	import PageTitle from '$lib/components/page-title.svelte';
	import { resolve } from '$app/paths';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { UserMultiple02Icon } from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
</script>

<PageTitle title="Watch party ended" />

<!-- Only rendered when the party is gone: a live one redirects to its watch page. -->
<div class="flex min-h-[60vh] page-gutter items-center justify-center">
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon">
				<HugeiconsIcon icon={UserMultiple02Icon} />
			</Empty.Media>
			<Empty.Title>This watch party has ended</Empty.Title>
			<Empty.Description>
				The host ended it, or everyone left a while ago. Ask for a new link, or start your own from
				any title's page.
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button href={resolve('/')} variant="secondary">Back to home</Button>
		</Empty.Content>
	</Empty.Root>
</div>
