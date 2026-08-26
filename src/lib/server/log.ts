import pino from 'pino';
import { dev } from '$app/environment';

export const log = pino({
	level: process.env.LOG_LEVEL ?? (dev ? 'debug' : 'info')
});
