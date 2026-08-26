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
