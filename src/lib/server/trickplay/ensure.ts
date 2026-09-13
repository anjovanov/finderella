import { TrickplayEnsureResult, type TrickplayGeometry } from '@finderella/protocol';
import type { ConnectedGateway } from '$lib/server/gateways/registry';
import { registry } from '$lib/server/gateways/registry';
import { log } from '$lib/server/log';

/** What `trickplay.ensure` needs to know about a file: the row plus its library root. */
export interface TrickplayTarget {
	gatewayId: string;
	rootPath: string;
	file: { id: string; relPath: string; durationMs: number | null };
}

/** The device holding the file can make thumbnails and the file has a probed duration. */
export function canTrickplay(
	gateway: ConnectedGateway | undefined,
	file: { durationMs: number | null }
): boolean {
	return Boolean(gateway?.capabilities.trickplay && file.durationMs);
}

/**
 * Ask the device to make (or report on) a file's sprite sheets. Best effort:
 * offline device, a gateway that never answers, a malformed reply or the
 * timeout all yield null — thumbnails are an extra, never a reason to fail
 * playback. The gateway keeps working on the job regardless.
 */
export async function ensureTrickplay(
	target: TrickplayTarget,
	priority: 'high' | 'low',
	timeoutMs: number
): Promise<TrickplayEnsureResult | null> {
	try {
		const data = await registry.request(
			target.gatewayId,
			{
				type: 'trickplay.ensure',
				rootPath: target.rootPath,
				relPath: target.file.relPath,
				priority
			},
			{ timeoutMs }
		);
		const parsed = TrickplayEnsureResult.safeParse(data);
		if (!parsed.success) {
			log.warn({ fileId: target.file.id }, 'malformed trickplay.ensure reply');
			return null;
		}
		return parsed.data;
	} catch (err) {
		log.debug({ err, fileId: target.file.id }, 'trickplay.ensure failed');
		return null;
	}
}

/** Geometry usable for serving: the job is ready or underway (not failed). */
export function usableGeometry(result: TrickplayEnsureResult | null): TrickplayGeometry | null {
	if (!result || result.status === 'failed' || !result.geometry) return null;
	return result.geometry;
}

export function trickplayVttSrc(sessionId: string): string {
	return `/api/stream/${sessionId}/trickplay/index.vtt`;
}
