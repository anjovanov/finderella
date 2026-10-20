import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

// The dev server re-instantiates this module after edits under its import
// graph; a client per instance leaked a pool of idle connections each time,
// until Postgres refused new ones. One client per process, on globalThis.
const globals = globalThis as { __finderellaPostgres?: postgres.Sql };
const client = (globals.__finderellaPostgres ??= postgres(env.DATABASE_URL));

export const db = drizzle(client, { schema });
