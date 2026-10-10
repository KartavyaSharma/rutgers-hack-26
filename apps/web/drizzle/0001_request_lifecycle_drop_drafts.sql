DROP TABLE "drafts" CASCADE;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "nudged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "notes" jsonb DEFAULT '[]'::jsonb NOT NULL;