<script lang="ts">
	import { goto } from '$app/navigation';
	import { page as appPage } from '$app/state';
	import * as Pagination from '$lib/components/ui/pagination';

	/**
	 * Page numbers under a statistics table; the page lives in the URL
	 * (`?page=`), so the route's load serves it and links stay shareable.
	 * Renders nothing when everything fits on one page.
	 */
	let { total, perPage, page }: { total: number; perPage: number; page: number } = $props();

	function go(next: number) {
		const url = new URL(appPage.url);
		if (next <= 1) url.searchParams.delete('page');
		else url.searchParams.set('page', String(next));
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same route, new query
		void goto(url, { keepFocus: true });
	}
</script>

{#if total > perPage}
	<Pagination.Root count={total} {perPage} {page} onPageChange={go}>
		{#snippet children({ pages, currentPage })}
			<Pagination.Content>
				<Pagination.Item><Pagination.Previous /></Pagination.Item>
				{#each pages as p (p.key)}
					{#if p.type === 'ellipsis'}
						<Pagination.Item><Pagination.Ellipsis /></Pagination.Item>
					{:else}
						<Pagination.Item>
							<Pagination.Link page={p} isActive={currentPage === p.value}
								>{p.value}</Pagination.Link
							>
						</Pagination.Item>
					{/if}
				{/each}
				<Pagination.Item><Pagination.Next /></Pagination.Item>
			</Pagination.Content>
		{/snippet}
	</Pagination.Root>
{/if}
