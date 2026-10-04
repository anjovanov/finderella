CREATE TABLE "metadata_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"tmdb_api_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
