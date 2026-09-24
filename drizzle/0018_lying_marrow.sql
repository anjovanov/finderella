CREATE TABLE "device_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"actor_user_id" text,
	"actor_name" text,
	"gateway_id" uuid,
	"gateway_name" text,
	"library_id" uuid,
	"library_name" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_event" ADD CONSTRAINT "device_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_event" ADD CONSTRAINT "device_event_gateway_id_gateway_id_fk" FOREIGN KEY ("gateway_id") REFERENCES "public"."gateway"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_event" ADD CONSTRAINT "device_event_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_event_created_idx" ON "device_event" USING btree ("created_at");