CREATE TYPE "public"."device_platform" AS ENUM('android', 'web', 'desktop');--> statement-breakpoint
CREATE TYPE "public"."dose_status" AS ENUM('upcoming', 'due', 'taken', 'missed', 'skipped', 'snoozed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."drug_form" AS ENUM('tablet', 'capsule', 'syrup', 'injection', 'drops', 'inhaler', 'patch', 'other');--> statement-breakpoint
CREATE TYPE "public"."food_rule" AS ENUM('with', 'before', 'after', 'emptyStomach', 'avoid', 'custom');--> statement-breakpoint
CREATE TYPE "public"."inventory_event_type" AS ENUM('initial', 'doseTaken', 'manualAdd', 'manualRemove', 'purchase', 'correction', 'discontinued');--> statement-breakpoint
CREATE TYPE "public"."lab_status" AS ENUM('pending', 'summarised', 'failed');--> statement-breakpoint
CREATE TYPE "public"."med_status" AS ENUM('active', 'paused', 'finished', 'discontinued');--> statement-breakpoint
CREATE TYPE "public"."notif_mode" AS ENUM('off', 'escalationOnly', 'mirrorAll', 'digest');--> statement-breakpoint
CREATE TYPE "public"."package_kind" AS ENUM('strips', 'direct');--> statement-breakpoint
CREATE TYPE "public"."schedule_kind" AS ENUM('daily', 'everyNDays', 'weekdays', 'prn', 'taper');--> statement-breakpoint
CREATE TYPE "public"."test_interval" AS ENUM('monthly', '3m', '6m', 'yearly', 'custom');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"actor_device_id" text,
	"at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"platform" "device_platform" NOT NULL,
	"bound_person_id" uuid,
	"mode" text DEFAULT 'caregiver' NOT NULL,
	"push_subscription" jsonb,
	"fcm_token" text,
	"last_seen_at" timestamp with time zone,
	"alarm_health" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"rev" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"storage_path" text NOT NULL,
	"size_bytes" integer,
	"mime_type" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"rev" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dose_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"medication_id" uuid NOT NULL,
	"schedule_id" uuid,
	"scheduled_at_utc" timestamp with time zone NOT NULL,
	"local_day" date NOT NULL,
	"status" "dose_status" DEFAULT 'upcoming' NOT NULL,
	"acted_at_utc" timestamp with time zone,
	"acted_by_device_id" text,
	"quantity" real,
	"source" text DEFAULT 'caregiver' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"note" text,
	"idempotency_key" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"rev" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"text" text NOT NULL,
	"related_medication_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"rev" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medication_id" uuid NOT NULL,
	"type" "inventory_event_type" NOT NULL,
	"qty" real NOT NULL,
	"reason" text,
	"prev_balance" real NOT NULL,
	"new_balance" real NOT NULL,
	"at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text,
	"dose_event_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"rev" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"type" text NOT NULL,
	"taken_at" date NOT NULL,
	"file_ref" text,
	"ai_summary" jsonb,
	"status" "lab_status" DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"rev" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"active_ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"strength_value" real,
	"strength_unit" text,
	"form" "drug_form" DEFAULT 'tablet' NOT NULL,
	"package_kind" "package_kind" DEFAULT 'direct' NOT NULL,
	"strips" integer,
	"pills_per_strip" integer,
	"pill_count" integer,
	"manufacturer" text,
	"notes" text,
	"rx_is_prescription" boolean DEFAULT true NOT NULL,
	"rx_is_controlled" boolean DEFAULT false NOT NULL,
	"rx_renewal_date" date,
	"pack_expiry" date,
	"start_date" date NOT NULL,
	"end_date" date,
	"food_rule_mode" "food_rule" DEFAULT 'with' NOT NULL,
	"food_rule_text" text,
	"cost_package_price" real,
	"cost_currency" text DEFAULT 'EGP' NOT NULL,
	"cost_purchased_at" date,
	"cost_package_size" integer,
	"doctor" text,
	"condition" text,
	"status" "med_status" DEFAULT 'active' NOT NULL,
	"discontinued_reason" text,
	"balance_cache" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"rev" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notif_prefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"mode" "notif_mode" DEFAULT 'mirrorAll' NOT NULL,
	"delay_min" integer DEFAULT 30 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"rev" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name_ar" text NOT NULL,
	"dob" date,
	"gender" text,
	"blood_type" text,
	"allergies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"emergency_name" text,
	"emergency_phone" text,
	"emergency_relation" text,
	"color_tag" text DEFAULT 'brand' NOT NULL,
	"is_minor" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'Africa/Cairo' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"rev" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"name" text NOT NULL,
	"interval" "test_interval" DEFAULT 'monthly' NOT NULL,
	"custom_days" integer,
	"next_due" date NOT NULL,
	"last_done" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"rev" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medication_id" uuid NOT NULL,
	"kind" "schedule_kind" DEFAULT 'daily' NOT NULL,
	"times" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quantity_per_dose" real DEFAULT 1 NOT NULL,
	"doses_per_day" integer,
	"anchor_date" date NOT NULL,
	"end_date" date,
	"weekdays" jsonb,
	"interval_n" integer,
	"prn_max_per_day" integer,
	"taper_steps" jsonb,
	"active_from" date NOT NULL,
	"active_to" date,
	"superseded_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"rev" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symptoms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"severity" integer DEFAULT 1 NOT NULL,
	"note" text,
	"related_medication_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"rev" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"pin_hash" text,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_bound_person_id_persons_id_fk" FOREIGN KEY ("bound_person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_events" ADD CONSTRAINT "dose_events_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_events" ADD CONSTRAINT "dose_events_medication_id_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_events" ADD CONSTRAINT "dose_events_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_medication_id_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notif_prefs" ADD CONSTRAINT "notif_prefs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notif_prefs" ADD CONSTRAINT "notif_prefs_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tests" ADD CONSTRAINT "recurring_tests_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_medication_id_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptoms" ADD CONSTRAINT "symptoms_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_logs" USING btree ("at_utc");--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "devices_bound_person_idx" ON "devices" USING btree ("bound_person_id");--> statement-breakpoint
CREATE INDEX "docs_person_idx" ON "documents" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dose_events_idem_idx" ON "dose_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "dose_events_day_idx" ON "dose_events" USING btree ("person_id","local_day");--> statement-breakpoint
CREATE INDEX "dose_events_sched_idx" ON "dose_events" USING btree ("scheduled_at_utc");--> statement-breakpoint
CREATE INDEX "food_person_idx" ON "food_logs" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "inv_events_med_idx" ON "inventory_events" USING btree ("medication_id");--> statement-breakpoint
CREATE INDEX "inv_events_dose_idx" ON "inventory_events" USING btree ("dose_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inv_events_dose_unique" ON "inventory_events" USING btree ("dose_event_id") WHERE dose_event_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "labs_person_idx" ON "lab_results" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "meds_person_idx" ON "medications" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "meds_status_idx" ON "medications" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "notif_prefs_pair_idx" ON "notif_prefs" USING btree ("device_id","person_id");--> statement-breakpoint
CREATE INDEX "persons_user_idx" ON "persons" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tests_person_idx" ON "recurring_tests" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "schedules_med_idx" ON "schedules" USING btree ("medication_id");--> statement-breakpoint
CREATE INDEX "symptoms_person_idx" ON "symptoms" USING btree ("person_id");