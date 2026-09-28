<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import type { Genre } from '$lib/data';

	const DEFAULT_SORT_LABELS: Record<string, string> = {
		title: 'Title A–Z',
		year: 'Newest first',
		rating: 'Top rated'
	};

	let {
		genre = $bindable('all'),
		sort = $bindable('title'),
		kind = $bindable('all'),
		genres,
		sortLabels = DEFAULT_SORT_LABELS,
		kindFilter = false
	}: {
		genre?: string;
		sort?: string;
		/** `all` | `movie` | `series` (only with `kindFilter`). */
		kind?: string;
		/** Genre options; empty hides the genre select. */
		genres: Genre[];
		/** Sort value → menu label; keys must be handled by the page's comparator. */
		sortLabels?: Record<string, string>;
		/** Show the All / Movies / Series select. */
		kindFilter?: boolean;
	} = $props();

	const KIND_LABELS: Record<string, string> = {
		all: 'Movies & series',
		movie: 'Movies',
		series: 'Series'
	};
</script>

<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
	<div class="flex flex-wrap gap-2">
		{#if kindFilter}
			<Select.Root type="single" bind:value={kind}>
				<Select.Trigger aria-label="Filter by type">
					{KIND_LABELS[kind] ?? KIND_LABELS.all}
				</Select.Trigger>
				<Select.Content>
					<Select.Group>
						{#each Object.entries(KIND_LABELS) as [value, label] (value)}
							<Select.Item {value} {label} />
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>
		{/if}
		{#if genres.length > 0}
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
		{/if}
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
