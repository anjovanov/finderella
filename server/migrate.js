/**
 * Applies the SQL migrations in drizzle/ to DATABASE_URL, then exits.
 *
 * Release installs (the hub tarball, the Docker image) run `npm ci --omit=dev`,
 * which leaves out drizzle-kit, so `npm run db:migrate` isn't available there.
 * drizzle-orm's migrator reads the same files and keeps the same
 * drizzle.__drizzle_migrations journal, so the two are interchangeable.
 *
 *   node --env-file-if-exists=.env server/migrate.js   (npm run db:migrate:deploy)
 */
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
	await migrate(drizzle(client), {
		migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url))
	});
	console.log('finderella: database migrations are up to date');
} finally {
	await client.end();
}
