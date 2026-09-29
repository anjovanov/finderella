<script lang="ts">
	import JobCard from './job-card.svelte';
	import type { ThumbnailJob } from './types';

	let { job }: { job: ThumbnailJob } = $props();

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

<JobCard
	{job}
	title={job.running ? 'Generating thumbnails' : 'Thumbnails finished'}
	scope={job.libraryName ?? 'Library'}
	stopAction="?/stopTrickplay"
	progressLabel="Thumbnail progress"
	{stats}
/>
