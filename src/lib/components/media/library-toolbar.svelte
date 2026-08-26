<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import type { Genre } from '$lib/data';

	let {
		genre = $bindable('all'),
		sort = $bindable('title'),
		genres
	}: {
		genre?: string;
		sort?: string;
		genres: Genre[];
	} = $props();

	const sortLabels: Record<string, string> = {
		title: 'Title A–Z',
		year: 'Newest first',
		rating: 'Top rated'
	};
</script>

<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
	<div class="flex gap-2">
		<Select.Root type="single" bind:value={genre}>
			<Select.Trigger aria-label="Filter by genre">
				{genre === 'all' ? 'All genres' : genre}
			</Select.Trigger>
			<Select.Content>
				<Select.Group>
					<Select.Item value="all" label="All genres" />
					{#each genres as g (g)}
						<Select.Item value={g} label={g} />
					{/each}
				</Select.Group>
			</Select.Content>
		</Select.Root>
		<Select.Root type="single" bind:value={sort}>
			<Select.Trigger aria-label="Sort by">
				{sortLabels[sort] ?? 'Sort'}
			</Select.Trigger>
			<Select.Content>
				<Select.Group>
					{#each Object.entries(sortLabels) as [value, label] (value)}
						<Select.Item {value} {label} />
					{/each}
				</Select.Group>
			</Select.Content>
		</Select.Root>
	</div>
</div>
