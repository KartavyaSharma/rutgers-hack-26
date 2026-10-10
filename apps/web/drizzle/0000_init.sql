CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"source" text NOT NULL,
	"text" text NOT NULL,
	"decision" jsonb NOT NULL,
	"patient_text" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"team" text NOT NULL,
	"category" text NOT NULL,
	"urgency" text NOT NULL,
	"clinical" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"option_id" text,
	"text" text,
	"staff_summary" text NOT NULL,
	"patient_reply" text,
	"language" text,
	"confidence" real,
	"route_reason" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drafts_room_status_created_idx" ON "drafts" USING btree ("room_id","status","created_at");--> statement-breakpoint
CREATE INDEX "requests_team_status_created_idx" ON "requests" USING btree ("team","status","created_at");--> statement-breakpoint
CREATE INDEX "requests_room_created_idx" ON "requests" USING btree ("room_id","created_at");