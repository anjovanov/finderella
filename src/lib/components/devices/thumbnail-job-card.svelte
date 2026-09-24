<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Progress } from '$lib/components/ui/progress';
	import { formatRelative } from '$lib/data/time';
	import type { ThumbnailJob } from './types';

	let { job }: { job: ThumbnailJob } = $props();

	const progress = $derived(job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0);
	const stats = $derived(
		[
			{ label: 'Processed', value: `${job.processed} / ${job.total}` },
			{ label: 'Generated', value: job.generated },
			{ label: 'Already had', value: job.alreadyReady },
			{ label: 'Failed', value: job.failed, tone: job.failed > 0 ? 'text-destructive' : '' },
			// Files scanned without a probed duration have nothing to lay out.
			job.skipped > 0 ? { label: 'No duration', value: job.skipped } : null
		].filter((s) => s !== null)
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>
			{job.running ? 'Generating thumbnails' : 'Thumbnails finished'}
		</Card.Title>
		<Card.Description class="truncate">
			{job.libraryName ?? 'Library'}
			{#if job.running && job.current}
				· <span class="font-mono text-xs" title={job.current}>{job.current}</span>
			{:else if job.finishedAt}
				· <span title={new Date(job.finishedAt).toLocaleString()}
					>{formatRelative(job.finishedAt)}</span
				>
			{/if}
		</Card.Description>
		{#if job.running}
			<Card.Action>
				<form method="POST" action="?/stopTrickplay" use:enhance>
					<Button type="submit" variant="outline" size="sm" disabled={job.stopRequested}>
						{job.stopRequested ? 'Stopping…' : 'Stop'}
					</Button>
				</form>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<div class="flex items-center gap-3">
			<Progress value={progress} class="h-2" aria-label="Thumbnail progress" />
			<span class="w-10 text-right text-xs text-muted-foreground tabular-nums">{progress}%</span>
		</div>

		<dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			{#each stats as stat (stat.label)}
				<div class="rounded-xl bg-muted/50 px-3 py-2">
					<dt class="text-xs text-muted-foreground">{stat.label}</dt>
					<dd class={['font-medium tabular-nums', 'tone' in stat && stat.tone]}>{stat.value}</dd>
				</div>
			{/each}
		</dl>

		{#if job.lastError}
			<p class="text-sm text-destructive">{job.lastError}</p>
		{/if}

		{#if job.recent.length > 0}
			<div
				class="max-h-48 overflow-y-auto rounded-xl border border-border/60 bg-muted/40 p-3 font-mono text-xs"
			>
				{#each job.recent as line (line.at + line.message)}
					<div
						class={line.level === 'error'
							? 'text-destructive'
							: line.level === 'warn'
								? 'text-amber-600 dark:text-amber-500'
								: ''}
					>
						<span class="text-muted-foreground">{new Date(line.at).toLocaleTimeString()}</span>
						{line.message}
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
