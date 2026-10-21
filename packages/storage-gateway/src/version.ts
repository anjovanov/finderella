import pkg from '../package.json' with { type: 'json' };

/** The gateway's release version: package.json is the only place it's written (release tags are checked against it). */
export const GATEWAY_VERSION: string = pkg.version;
