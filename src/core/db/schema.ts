/**
 * Health Tracker — Neon Postgres schema (Drizzle ORM).
 *
 * Mirrors the domain model 1:1. This file is the single source of truth for
 * migrations (`npm run db:generate`). Every synced table carries the sync
 * envelope: updatedAt / updatedBy / rev / deleted.
 *
 * Time rule: every instant is stored as `timestamptz` in UTC. Every
 * human-facing "day" is a `date` representing the LOCAL calendar day in the
 * person's IANA timezone — never a derived UTC date.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ─────────────────────────── enums ─────────────────────────── */

export const medStatusEnum = pgEnum("med_status", [
  "active",
  "paused",
  "finished",
  "discontinued",
]);

export const scheduleKindEnum = pgEnum("schedule_kind", [
  "daily",
  "everyNDays",
  "weekdays",
  "prn",
  "taper",
]);

export const doseStatusEnum = pgEnum("dose_status", [
  "upcoming",
  "due",
  "taken",
  "missed",
  "skipped",
  "snoozed",
  "cancelled",
]);

export const inventoryEventTypeEnum = pgEnum("inventory_event_type", [
  "initial",
  "doseTaken",
  "manualAdd",
  "manualRemove",
  "purchase",
  "correction",
  "discontinued",
]);

export const devicePlatformEnum = pgEnum("device_platform", [
  "android",
  "web",
  "desktop",
]);

export const notifModeEnum = pgEnum("notif_mode", [
  "off",
  "escalationOnly",
  "mirrorAll",
  "digest",
]);

export const labStatusEnum = pgEnum("lab_status", [
  "pending",
  "summarised",
  "failed",
]);

export const testIntervalEnum = pgEnum("test_interval", [
  "monthly",
  "3m",
  "6m",
  "yearly",
  "custom",
]);

export const foodRuleEnum = pgEnum("food_rule", [
  "with",
  "before",
  "after",
  "emptyStomach",
  "avoid",
  "custom",
]);

export const packageKindEnum = pgEnum("package_kind", ["strips", "direct"]);

export const drugFormEnum = pgEnum("drug_form", [
  "tablet",
  "capsule",
  "syrup",
  "injection",
  "drops",
  "inhaler",
  "patch",
  "other",
]);

/* ─────────────────────── sync envelope ─────────────────────── */

const syncMeta = {
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: text("updated_by"), // deviceId that wrote this row
  rev: integer("rev").notNull().default(1),
  deleted: boolean("deleted").notNull().default(false),
};

/* ─────────────────────────── users ─────────────────────────── */

/** Exactly one caregiver account in production (single family). */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  /** Caregiver PIN — separate from the account password and from app-lock. */
  pinHash: text("pin_hash"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ────────────────────────── persons ────────────────────────── */

export const persons = pgTable(
  "persons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nameAr: text("name_ar").notNull(),
    dob: date("dob"),
    gender: text("gender"),
    bloodType: text("blood_type"),
    allergies: jsonb("allergies").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    emergencyName: text("emergency_name"),
    emergencyPhone: text("emergency_phone"),
    emergencyRelation: text("emergency_relation"),
    colorTag: text("color_tag").notNull().default("brand"),
    isMinor: boolean("is_minor").notNull().default(false),
    /** IANA timezone — NEVER hardcode an offset (Egypt reintroduced DST). */
    timezone: text("timezone").notNull().default("Africa/Cairo"),
    ...syncMeta,
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("persons_user_idx").on(t.userId),
  }),
);

/* ────────────────────────── devices ────────────────────────── */

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    platform: devicePlatformEnum("platform").notNull(),
    /** At most one person per device. null = caregiver's own device. */
    boundPersonId: uuid("bound_person_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    /** 'mother' boots straight into Mother Mode; 'caregiver' is the full app. */
    mode: text("mode").notNull().default("caregiver"),
    pushSubscription: jsonb("push_subscription").$type<Record<string, unknown>>(),
    fcmToken: text("fcm_token"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    /** Alarm health watchdog (§9): zero silent failures. */
    alarmHealth: jsonb("alarm_health").$type<{
      exactAlarmGranted?: boolean;
      batteryExempt?: boolean;
      notifGranted?: boolean;
      lastRescheduleAtUtc?: string;
      nextAlarmAtUtc?: string;
    }>(),
    ...syncMeta,
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("devices_user_idx").on(t.userId),
    boundIdx: index("devices_bound_person_idx").on(t.boundPersonId),
  }),
);

/* ──────────────────────── medications ──────────────────────── */

export const medications = pgTable(
  "medications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en"),
    activeIngredients: jsonb("active_ingredients")
      .$type<string[]>()
      .notNull()
      .default([]),
    strengthValue: real("strength_value"),
    strengthUnit: text("strength_unit"),
    form: drugFormEnum("form").notNull().default("tablet"),
    packageKind: packageKindEnum("package_kind").notNull().default("direct"),
    strips: integer("strips"),
    pillsPerStrip: integer("pills_per_strip"),
    pillCount: integer("pill_count"),
    manufacturer: text("manufacturer"),
    notes: text("notes"),

    rxIsPrescription: boolean("rx_is_prescription").notNull().default(true),
    rxIsControlled: boolean("rx_is_controlled").notNull().default(false),
    rxRenewalDate: date("rx_renewal_date"),
    packExpiry: date("pack_expiry"),

    startDate: date("start_date").notNull(),
    endDate: date("end_date"),

    foodRuleMode: foodRuleEnum("food_rule_mode").notNull().default("with"),
    foodRuleText: text("food_rule_text"),

    costPackagePrice: real("cost_package_price"),
    costCurrency: text("cost_currency").notNull().default("EGP"),
    costPurchasedAt: date("cost_purchased_at"),
    costPackageSize: integer("cost_package_size"),

    doctor: text("doctor"),
    condition: text("condition"),

    status: medStatusEnum("status").notNull().default("active"),
    discontinuedReason: text("discontinued_reason"),

    /** Cached fold of inventoryEvents; recomputed from events when in doubt. */
    balanceCache: real("balance_cache").notNull().default(0),

    ...syncMeta,
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    personIdx: index("meds_person_idx").on(t.personId),
    statusIdx: index("meds_status_idx").on(t.status),
  }),
);

/* ───────────────────────── schedules ───────────────────────── */

/**
 * A medication may have many schedules over its lifetime. Editing a schedule
 * CLOSES the old one (sets activeTo) and inserts a new row — history is never
 * destroyed, and past dose events keep pointing at the old schedule.
 */
export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    medicationId: uuid("medication_id")
      .notNull()
      .references(() => medications.id, { onDelete: "cascade" }),
    kind: scheduleKindEnum("kind").notNull().default("daily"),
    /** Local wall-clock times "HH:mm" in the person's timezone. */
    times: jsonb("times").$type<string[]>().notNull().default([]),
    quantityPerDose: real("quantity_per_dose").notNull().default(1),
    dosesPerDay: integer("doses_per_day"),
    anchorDate: date("anchor_date").notNull(),
    endDate: date("end_date"),
    /** 0 = Sunday … 6 = Saturday */
    weekdays: jsonb("weekdays").$type<number[]>(),
    intervalN: integer("interval_n"),
    prnMaxPerDay: integer("prn_max_per_day"),
    taperSteps: jsonb("taper_steps").$type<
      { from: string; to: string; quantityPerDose: number }[]
    >(),
    activeFrom: date("active_from").notNull(),
    activeTo: date("active_to"), // null = current
    supersededBy: uuid("superseded_by"),
    ...syncMeta,
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    medIdx: index("schedules_med_idx").on(t.medicationId),
  }),
);

/* ──────────────────────── dose events ──────────────────────── */

export const doseEvents = pgTable(
  "dose_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    medicationId: uuid("medication_id")
      .notNull()
      .references(() => medications.id, { onDelete: "cascade" }),
    scheduleId: uuid("schedule_id").references(() => schedules.id, {
      onDelete: "set null",
    }),
    scheduledAtUtc: timestamp("scheduled_at_utc", {
      withTimezone: true,
    }).notNull(),
    /** Local calendar day (YYYY-MM-DD) — the day the dose belongs to. */
    localDay: date("local_day").notNull(),
    status: doseStatusEnum("status").notNull().default("upcoming"),
    actedAtUtc: timestamp("acted_at_utc", { withTimezone: true }),
    actedByDeviceId: text("acted_by_device_id"),
    quantity: real("quantity"),
    /** mother | caregiver | auto-missed */
    source: text("source").notNull().default("caregiver"),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    note: text("note"),
    /** personId + medicationId + scheduledAtUtc — makes double-tap a no-op. */
    idempotencyKey: text("idempotency_key").notNull(),
    ...syncMeta,
  },
  (t) => ({
    idemIdx: uniqueIndex("dose_events_idem_idx").on(t.idempotencyKey),
    dayIdx: index("dose_events_day_idx").on(t.personId, t.localDay),
    schedIdx: index("dose_events_sched_idx").on(t.scheduledAtUtc),
  }),
);

/* ───────────────────── inventory events ────────────────────── */

/** Append-only. Current balance is always the fold of these events. */
export const inventoryEvents = pgTable(
  "inventory_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    medicationId: uuid("medication_id")
      .notNull()
      .references(() => medications.id, { onDelete: "cascade" }),
    type: inventoryEventTypeEnum("type").notNull(),
    /** Signed quantity. */
    qty: real("qty").notNull(),
    reason: text("reason"),
    prevBalance: real("prev_balance").notNull(),
    newBalance: real("new_balance").notNull(),
    atUtc: timestamp("at_utc", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deviceId: text("device_id"),
    doseEventId: uuid("dose_event_id"),
    ...syncMeta,
  },
  (t) => ({
    medIdx: index("inv_events_med_idx").on(t.medicationId),
    doseIdx: index("inv_events_dose_idx").on(t.doseEventId),
    /**
     * Hard DB guarantee for §16: one inventory deduction per dose event.
     * A double tap or an offline replay cannot deduct twice even if the
     * application-level check is ever bypassed. Partial because PRN/refill
     * events legitimately have no dose id (NULLs stay distinct).
     */
    doseUnique: uniqueIndex("inv_events_dose_unique")
      .on(t.doseEventId)
      .where(sql`dose_event_id IS NOT NULL`),
  }),
);

/* ─────────────────── clinical & documents ──────────────────── */

export const labResults = pgTable(
  "lab_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    takenAt: date("taken_at").notNull(),
    fileRef: text("file_ref"),
    aiSummary: jsonb("ai_summary").$type<{
      schemaVersion: string;
      model: string;
      atUtc: string;
      sections: Record<string, string>;
      disclaimer: string;
    }>(),
    status: labStatusEnum("status").notNull().default("pending"),
    ...syncMeta,
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    personIdx: index("labs_person_idx").on(t.personId),
  }),
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("other"),
    title: text("title").notNull(),
    storagePath: text("storage_path").notNull(),
    sizeBytes: integer("size_bytes"),
    mimeType: text("mime_type"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...syncMeta,
  },
  (t) => ({
    personIdx: index("docs_person_idx").on(t.personId),
  }),
);

export const symptoms = pgTable(
  "symptoms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    atUtc: timestamp("at_utc", { withTimezone: true }).notNull().defaultNow(),
    severity: integer("severity").notNull().default(1), // 1–5
    note: text("note"),
    relatedMedicationId: uuid("related_medication_id"),
    ...syncMeta,
  },
  (t) => ({
    personIdx: index("symptoms_person_idx").on(t.personId),
  }),
);

export const foodLogs = pgTable(
  "food_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    atUtc: timestamp("at_utc", { withTimezone: true }).notNull().defaultNow(),
    text: text("text").notNull(),
    relatedMedicationId: uuid("related_medication_id"),
    ...syncMeta,
  },
  (t) => ({
    personIdx: index("food_person_idx").on(t.personId),
  }),
);

export const recurringTests = pgTable(
  "recurring_tests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    interval: testIntervalEnum("interval").notNull().default("monthly"),
    customDays: integer("custom_days"),
    nextDue: date("next_due").notNull(),
    lastDone: date("last_done"),
    ...syncMeta,
  },
  (t) => ({
    personIdx: index("tests_person_idx").on(t.personId),
  }),
);

/* ───────────────────────── system ──────────────────────────── */

/** Per-(device, person) alert preference for caregiver devices. */
export const notifPrefs = pgTable(
  "notif_prefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    mode: notifModeEnum("mode").notNull().default("mirrorAll"),
    delayMin: integer("delay_min").notNull().default(30),
    ...syncMeta,
  },
  (t) => ({
    pairIdx: uniqueIndex("notif_prefs_pair_idx").on(t.deviceId, t.personId),
  }),
);

/** Append-only. Never contains clinical free-text beyond field names. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    actorDeviceId: text("actor_device_id"),
    atUtc: timestamp("at_utc", { withTimezone: true }).notNull().defaultNow(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
  },
  (t) => ({
    entityIdx: index("audit_entity_idx").on(t.entity, t.entityId),
    atIdx: index("audit_at_idx").on(t.atUtc),
  }),
);

/* ───────────────────── inferred types ──────────────────────── */

export type User = typeof users.$inferSelect;
export type Person = typeof persons.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type Medication = typeof medications.$inferSelect;
export type Schedule = typeof schedules.$inferSelect;
export type DoseEvent = typeof doseEvents.$inferSelect;
export type InventoryEvent = typeof inventoryEvents.$inferSelect;
export type LabResult = typeof labResults.$inferSelect;
export type RecurringTest = typeof recurringTests.$inferSelect;
