import { z } from "zod";

// z.guid() accepts any 8-4-4-4-12 hex id (seeded fixed ids are valid v4 too, but stay lenient).
const id = z.guid({ error: "Pick a value" });
const optionalId = z.preprocess((v) => (v === "" || v === "none" ? undefined : v), z.guid().optional());
const isoDate = z.iso.date({ error: "Use YYYY-MM-DD" });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24 h)");
const optionalText = (max: number) => z.string().trim().max(max).optional();
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const optionalInt = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v === undefined ? undefined : Number(v)), z.number().int().min(min).max(max).optional());

export const departmentSchema = z.object({ name: z.string().trim().min(2).max(120) });

export const semesterSchema = z
  .object({ name: z.string().trim().min(2).max(60), starts_on: isoDate, ends_on: isoDate })
  .refine((s) => s.ends_on >= s.starts_on, { path: ["ends_on"], message: "End must be on or after start" });

export const holidaySchema = z.object({
  semester_id: id,
  day: isoDate,
  kind: z.enum(["holiday", "exam"]).default("holiday"),
  name: optionalText(80),
});

export const courseSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,12}$/, "3-12 letters/digits, e.g. IOT401"),
  title: z.string().trim().min(2).max(160),
  department_id: optionalId,
  credits: optionalInt(0, 12),
});

export const sectionSchema = z.object({
  course_id: id,
  semester_id: id,
  section_no: z.string().trim().min(1).max(10),
  room_id: optionalId,
});

export const STAFF_ROLES = ["primary", "ta", "substitute"] as const;
export const sectionStaffSchema = z.object({
  section_id: id,
  profile_id: id,
  staff_role: z.enum(STAFF_ROLES).default("primary"),
});

/** Polygon ring as [lng, lat] pairs (GeoJSON order). At least 3 distinct points. */
export const ringSchema = z
  .array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]))
  .min(3, "Draw at least 3 points")
  .max(100);

export const roomSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,12}$/, "2-12 letters/digits, e.g. B204"),
  name: optionalText(80),
  building: optionalText(80),
  floor: optionalInt(-5, 200),
  max_gps_accuracy_m: z.preprocess((v) => Number(v ?? 40), z.number().int().min(5).max(200)),
  require_qr: checkbox,
  geofence: z
    .preprocess((v) => (typeof v === "string" && v ? JSON.parse(v) : undefined), ringSchema.optional())
    .optional(),
});

export const timetableSlotSchema = z
  .object({
    section_id: id,
    weekday: z.preprocess((v) => Number(v), z.number().int().min(1).max(7)),
    start_time: hhmm,
    end_time: hhmm,
    room_id: optionalId,
  })
  .refine((s) => s.end_time > s.start_time, { path: ["end_time"], message: "End must be after start" });

export const ASSIGNABLE_ROLES = ["student", "professor", "operator", "admin"] as const;
export const personSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  full_name: z.string().trim().min(2).max(120),
  role: z.enum(ASSIGNABLE_ROLES).default("student"),
  student_no: optionalText(30),
  department_id: optionalId,
});
export type PersonInput = z.infer<typeof personSchema>;

export const enrollmentSchema = z.object({
  section_id: id,
  student_ids: z.array(id).min(1, "Pick at least one student"),
  starts_on: isoDate,
});

export const dropSchema = z.object({ section_id: id, student_id: id, ends_on: isoDate });

export const policySchema = z
  .object({
    present_until_min: z.number().int().min(0).max(60),
    late_until_min: z.number().int().min(1).max(120),
    first_mismatch_check_min: z.number().int().min(1).max(60),
    mismatch_interval_min: z.number().int().min(1).max(30),
    verify_window_min: z.number().int().min(1).max(30),
    recheck_before_end_min: z.number().int().min(1).max(60),
    recheck_window_min: z.number().int().min(1).max(30),
    count_tolerance: z.number().int().min(0).max(10),
    stable_count_seconds: z.number().int().min(10).max(600),
    left_early_counts_as: z.enum(["absent", "partial"]),
    late_weight: z.number().min(0).max(1),
    lock_after_hours: z.number().int().min(1).max(720),
    appeal_days: z.number().int().min(1).max(60),
    gate_accept_threshold: z.number().min(0).max(1),
    gate_min_margin: z.number().min(0).max(1),
    gate_min_votes: z.number().int().min(1).max(10),
    verify_threshold: z.number().min(0).max(1),
    gps_max_accuracy_m: z.number().int().min(5).max(200),
    qr_slot_seconds: z.number().int().min(10).max(120),
    warn_attendance_pct: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]),
  })
  .refine((p) => p.late_until_min > p.present_until_min, {
    path: ["late_until_min"],
    message: "Late window must end after the present window",
  })
  .refine((p) => p.warn_attendance_pct[0] >= p.warn_attendance_pct[1], {
    path: ["warn_attendance_pct"],
    message: "First warning level must be the higher one",
  });
export type Policy = z.infer<typeof policySchema>;

export const DEVICE_KINDS = ["edge", "ingest", "simulator", "esp32"] as const;
export const deviceSchema = z.object({
  name: z.string().trim().min(2).max(60),
  room_id: id,
  kind: z.enum(DEVICE_KINDS).default("edge"),
});

/** Normalised point in an image (0..1), used for ROI polygons and the entry line. */
const normPoint = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
export const cameraGeometrySchema = z.object({
  camera_id: id,
  roi: z.array(normPoint).min(3).max(50).nullable(),
  entry_line: z.array(normPoint).length(2).nullable(),
  exit_line: z.array(normPoint).length(2).nullable().default(null),
  door_point: normPoint.nullable().default(null),
});

/** One row of the people CSV import (header: email,full_name,role,student_no). */
export const csvPersonSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  full_name: z.string().trim().min(2).max(120),
  role: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : "student"),
    z.enum(ASSIGNABLE_ROLES),
  ),
  student_no: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined), z.string().max(30).optional()),
});
