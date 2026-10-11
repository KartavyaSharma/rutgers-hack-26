CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text,
	"task_id" text,
	"patient_id" text,
	"type" text NOT NULL,
	"actor" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory" (
	"id" text PRIMARY KEY NOT NULL,
	"request_text" text NOT NULL,
	"text" text NOT NULL,
	"kind" text,
	"team_said" text,
	"team_chosen" text,
	"ticket_id" text,
	"patient_id" text,
	"unit" text DEFAULT '4 West' NOT NULL,
	"created_by" text NOT NULL,
	"times_used" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"version" integer NOT NULL,
	"plan" jsonb NOT NULL,
	"summary" text NOT NULL,
	"team" text NOT NULL,
	"tier" text NOT NULL,
	"source" text NOT NULL,
	"confidence" real,
	"facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"memory_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"recommendation_id" text,
	"reviewer_id" text NOT NULL,
	"reviewer_name" text NOT NULL,
	"verdict" text NOT NULL,
	"team" text,
	"reason" text,
	"note" text,
	"send_ids" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text,
	"patient_id" text,
	"patient_name" text NOT NULL,
	"room" text NOT NULL,
	"unit" text DEFAULT '4 West' NOT NULL,
	"title" text NOT NULL,
	"tier" text NOT NULL,
	"owner_id" text NOT NULL,
	"owner" jsonb NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"created_by" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"due_at" timestamp with time zone,
	"status_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" uuid,
	"patient_id" text NOT NULL,
	"patient_name" text NOT NULL,
	"room_id" text NOT NULL,
	"bed" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT '4 West' NOT NULL,
	"words" text NOT NULL,
	"channel" text NOT NULL,
	"channel_note" text,
	"language" text,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"team" text NOT NULL,
	"tier" text NOT NULL,
	"clinical" boolean DEFAULT false NOT NULL,
	"watch" text,
	"state" text DEFAULT 'needs_ok' NOT NULL,
	"nurse_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory" ADD CONSTRAINT "memory_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_ticket_idx" ON "events" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "events_patient_type_idx" ON "events" USING btree ("patient_id","type","created_at");--> statement-breakpoint
CREATE INDEX "memory_unit_active_idx" ON "memory" USING btree ("unit","active");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendations_ticket_version_idx" ON "recommendations" USING btree ("ticket_id","version");--> statement-breakpoint
CREATE INDEX "reviews_ticket_idx" ON "reviews" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status","status_at");--> statement-breakpoint
CREATE INDEX "tasks_owner_idx" ON "tasks" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "tasks_patient_idx" ON "tasks" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "tasks_ticket_idx" ON "tasks" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "tickets_state_created_idx" ON "tickets" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "tickets_patient_created_idx" ON "tickets" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE INDEX "tickets_request_idx" ON "tickets" USING btree ("request_id");