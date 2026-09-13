import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import { mediaFile } from './gateways.sql';

/**
 * Subtitle provider configuration — a single row (`id = 'default'`) edited on
 * /admin/subtitles. Keys are stored as entered (self-hosted hub; the admin
 * page only ever shows the last characters).
 */
export const subtitleSettings = pgTable('subtitle_settings', {
	id: text('id').primaryKey().default('default'),
	opensubtitlesApiKey: text('opensubtitles_api_key'),
	opensubtitlesUsername: text('opensubtitles_username'),
	opensubtitlesPassword: text('opensubtitles_password'),
	subdlApiKey: text('subdl_api_key'),
	/** Addic7ed/SuperSubtitles via the keyless Gestdown proxy (TV only); opt-in. */
	gestdownEnabled: boolean('gestdown_enabled').notNull().default(false),
	titloviUsername: text('titlovi_username'),
	titloviPassword: text('titlovi_password'),
	/** Comma-separated ISO 639-1 codes bulk/auto downloads want for every title. */
	languages: text('languages').notNull().default('en'),
	/** Run the downloader for new titles after each library scan. */
	autoDownload: boolean('auto_download').notNull().default(false),
	preferHearingImpaired: boolean('prefer_hearing_impaired').notNull().default(false),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});
export type SubtitleSettingsRow = typeof subtitleSettings.$inferSelect;

/**
 * Every download attempt, successful or not. `not_found` rows let the bulk
 * job skip titles it searched recently (quota is scarce); `downloaded` rows
 * are the history the admin page shows. A rescan may replace the
 * media_subtitle row, but the file this points at stays on the device.
 */
export const subtitleDownload = pgTable(
	'subtitle_download',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		mediaFileId: uuid('media_file_id')
			.notNull()
			.references(() => mediaFile.id, { onDelete: 'cascade' }),
		language: text('language').notNull(),
		provider: text('provider', { enum: ['opensubtitles', 'subdl', 'gestdown', 'titlovi'] }),
		providerId: text('provider_id'),
		releaseName: text('release_name'),
		/** Library-relative path of the sidecar that was written. */
		relPath: text('rel_path'),
		status: text('status', { enum: ['downloaded', 'not_found', 'failed'] }).notNull(),
		error: text('error'),
		source: text('source', { enum: ['player', 'bulk', 'auto'] }).notNull(),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('subtitle_download_file_lang_idx').on(t.mediaFileId, t.language, t.createdAt)]
);
export type SubtitleDownloadRow = typeof subtitleDownload.$inferSelect;
