import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface GatewayConfig {
	hubUrl: string;
	token: string;
	gatewayId?: string;
	name?: string;
}

export function configDir(): string {
	const base =
		process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME !== ''
			? process.env.XDG_CONFIG_HOME
			: join(homedir(), '.config');
	return join(base, 'finderella-storage-gateway');
}

/** Regenerable state (trickplay sprite sheets); safe to delete, unlike the config dir. */
export function cacheDir(): string {
	const base =
		process.env.XDG_CACHE_HOME && process.env.XDG_CACHE_HOME !== ''
			? process.env.XDG_CACHE_HOME
			: join(homedir(), '.cache');
	return join(base, 'finderella-storage-gateway');
}

/**
 * HLS transcode scratch (one folder per session, removed when it stops).
 * Never `os.tmpdir()`: on Fedora, Arch and Debian 13 `/tmp` is a RAM-backed
 * tmpfs, and a long transcode would fill memory. `FINDERELLA_TRANSCODE_DIR`
 * points it at a bigger or faster disk.
 */
export function transcodeDir(): string {
	const override = process.env.FINDERELLA_TRANSCODE_DIR;
	return override && override !== '' ? override : join(cacheDir(), 'transcode');
}

export function configPath(): string {
	return join(configDir(), 'config.json');
}

export function loadConfig(): GatewayConfig | null {
	try {
		return JSON.parse(readFileSync(configPath(), 'utf8')) as GatewayConfig;
	} catch {
		return null;
	}
}

export function saveConfig(config: GatewayConfig): void {
	mkdirSync(configDir(), { recursive: true });
	// Contains the gateway's bearer token — keep it owner-readable only.
	writeFileSync(configPath(), JSON.stringify(config, null, '\t') + '\n', { mode: 0o600 });
}
