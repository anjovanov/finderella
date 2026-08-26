import { relations } from 'drizzle-orm';
import {
	bigint,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import { episode, movie } from './catalog.sql';

export const libraryKind = pgEnum('library_kind', ['movie', 'series']);
export const mediaFileStatus = pgEnum('media_file_status', ['active', 'missing']);

export interface AgentCapabilitiesJson {
	ffmpeg: boolean;
	ffmpegVersion?: string;
	hwaccels: string[];
}

/** A paired media agent (a device that serves local files to the hub). */
export const agent = pgTable('agent', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	// sha256 hex of the bearer token minted at pairing; the token itself is
	// only ever held by the agent.
	tokenHash: text('token_hash').notNull().unique(),
	pairedByUserId: text('paired_by_user_id')
		.notNull()
		.references(() => user.id),
	agentVersion: text('agent_version'),
	capabilities: jsonb('capabilities').$type<AgentCapabilitiesJson>(),
	lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const agentPairingCode = pgTable('agent_pairing_code', {
	id: uuid('id').primaryKey().defaultRandom(),
	code: text('code').notNull().unique(),
	agentName: text('agent_name').notNull(),
	createdByUserId: text('created_by_user_id')
		.notNull()
		.references(() => user.id),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	claimedByAgentId: uuid('claimed_by_agent_id').references(() => agent.id, {
		onDelete: 'set null'
	}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/** A root folder on an agent that holds movies or series. */
export const library = pgTable(
	'library',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		agentId: uuid('agent_id')
			.notNull()
			.references(() => agent.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		rootPath: text('root_path').notNull(),
		kind: libraryKind('kind').notNull(),
		lastScanAt: timestamp('last_scan_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [unique().on(t.agentId, t.rootPath)]
);

export const mediaFile = pgTable(
	'media_file',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		libraryId: uuid('library_id')
			.notNull()
			.references(() => library.id, { onDelete: 'cascade' }),
		// Denormalized from library for stream routing without a join.
		agentId: uuid('agent_id')
			.notNull()
			.references(() => agent.id, { onDelete: 'cascade' }),
		relPath: text('rel_path').notNull(),
		size: bigint('size', { mode: 'number' }).notNull(),
		mtimeMs: bigint('mtime_ms', { mode: 'number' }).notNull(),
		container: text('container').notNull(),
		videoCodec: text('video_codec'),
		audioCodec: text('audio_codec'),
		width: integer('width'),
		height: integer('height'),
		durationMs: integer('duration_ms'),
		bitrate: integer('bitrate'),
		status: mediaFileStatus('status').notNull().default('active'),
		// Set on every upsert during a scan; files not seen by a finished scan
		// are marked missing.
		scanSeenAt: timestamp('scan_seen_at', { withTimezone: true }),
		// A file resolves to at most one catalog item; an item can have many
		// files (same title on several agents / qualities).
		movieId: uuid('movie_id').references(() => movie.id, { onDelete: 'set null' }),
		episodeId: uuid('episode_id').references(() => episode.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [unique().on(t.libraryId, t.relPath)]
);

export const agentRelations = relations(agent, ({ many }) => ({
	libraries: many(library)
}));

export const libraryRelations = relations(library, ({ one, many }) => ({
	agent: one(agent, { fields: [library.agentId], references: [agent.id] }),
	files: many(mediaFile)
}));

export const mediaFileRelations = relations(mediaFile, ({ one }) => ({
	library: one(library, { fields: [mediaFile.libraryId], references: [library.id] }),
	agent: one(agent, { fields: [mediaFile.agentId], references: [agent.id] }),
	movie: one(movie, { fields: [mediaFile.movieId], references: [movie.id] }),
	episode: one(episode, { fields: [mediaFile.episodeId], references: [episode.id] })
}));
