import {
	decodeFingerprint,
	MarkersAnalyzeResult,
	type MarkersAnalysis
} from '@finderella/protocol';
import { registry } from '$lib/server/gateways/registry';
import { log } from '$lib/server/log';
import type { AnalysisSpec } from './regions';

/** What `markers.analyze` needs to know about a file. */
export interface AnalysisTarget {
	fileId: string;
	gatewayId: string;
	rootPath: string;
	relPath: string;
}

const REQUEST_TIMEOUT_MS = 15_000;
const POLL_MS = 2_000;
/** One file may not hold a run hostage (a huge remux on a slow NAS). */
const FILE_CAP_MS = 10 * 60 * 1000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One `markers.analyze` round trip. Null = offline, no answer, malformed reply. */
async function requestAnalysis(
	target: AnalysisTarget,
	spec: AnalysisSpec,
	audioStreamIndex: number | undefined
): Promise<MarkersAnalyzeResult | null> {
	try {
		const data = await registry.request(
			target.gatewayId,
			{
				type: 'markers.analyze',
				rootPath: target.rootPath,
				relPath: target.relPath,
				...(audioStreamIndex === undefined ? {} : { audioStreamIndex }),
				regions: spec.regions,
				...(spec.darkframes ? { darkframes: spec.darkframes } : {})
			},
			{ timeoutMs: REQUEST_TIMEOUT_MS }
		);
		const parsed = MarkersAnalyzeResult.safeParse(data);
		if (!parsed.success) {
			log.warn({ fileId: target.fileId }, 'malformed markers.analyze reply');
			return null;
		}
		return parsed.data;
	} catch (err) {
		log.debug({ err, fileId: target.fileId }, 'markers.analyze failed');
		return null;
	}
}

export type AnalysisOutcome =
	| { status: 'ready'; analysis: MarkersAnalysis }
	| { status: 'failed'; error: string }
	/** Device offline, not answering, too slow, or the run was stopped: try again another time. */
	| { status: 'unavailable' };

/**
 * The device's analysis of a file — from its cache when it has one, else
 * after the device computed it (polled; the device works through one file at
 * a time at low priority).
 */
export async function awaitAnalysis(
	target: AnalysisTarget,
	spec: AnalysisSpec,
	audioStreamIndex: number | undefined,
	shouldStop: () => boolean
): Promise<AnalysisOutcome> {
	const deadline = Date.now() + FILE_CAP_MS;
	for (;;) {
		const result = await requestAnalysis(target, spec, audioStreamIndex);
		if (!result) return { status: 'unavailable' };
		if (result.status === 'ready') {
			return result.analysis
				? { status: 'ready', analysis: result.analysis }
				: { status: 'failed', error: 'device returned no analysis' };
		}
		if (result.status === 'failed') {
			return { status: 'failed', error: result.error ?? 'analysis failed' };
		}
		if (shouldStop() || Date.now() > deadline) return { status: 'unavailable' };
		await sleep(POLL_MS);
	}
}

/** A region's fingerprint, decoded; undefined when the analysis lacks it. */
export function regionFingerprint(
	analysis: MarkersAnalysis,
	kind: 'intro' | 'credits'
): { startMs: number; fingerprint: Uint32Array } | undefined {
	const region = analysis.regions.find((r) => r.kind === kind);
	if (!region) return undefined;
	return { startMs: region.startMs, fingerprint: decodeFingerprint(region.fingerprint) };
}
