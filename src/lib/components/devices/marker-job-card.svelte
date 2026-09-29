<script lang="ts">
	import JobCard from './job-card.svelte';
	import type { MarkersJob } from './types';

	let { job }: { job: MarkersJob } = $props();

	const stats = $derived(
		[
			{ label: 'Processed', value: `${job.processed} / ${job.total}` },
			{ label: 'Intros found', value: job.intros },
			{ label: 'Credits found', value: job.credits },
			{ label: 'Failed', value: job.failed, tone: job.failed > 0 ? 'text-destructive' : '' },
			// Pending files on offline (or not yet updated) devices are picked up once they can analyse.
			job.waiting > 0 ? { label: 'Waiting for device', value: job.waiting } : null
		].filter((s) => s !== null)
	);
</script>

<JobCard
	{job}
	title={job.running ? 'Detecting intros & credits' : 'Intro & credits detection finished'}
	scope={job.libraryName ?? 'All libraries'}
	stopAction="?/stopMarkers"
	progressLabel="Intro and credits detection progress"
	{stats}
/>
