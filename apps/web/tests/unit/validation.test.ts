import { describe, expect, it } from "vitest";
import {
  cameraGeometrySchema,
  courseSchema,
  enrollmentSchema,
  personSchema,
  policySchema,
  roomSchema,
  semesterSchema,
  timetableSlotSchema,
} from "@/lib/validation";

const ID = "50000000-0000-4000-8000-000000000001";
const DEFAULT_POLICY = {
  present_until_min: 10,
  late_until_min: 30,
  first_mismatch_check_min: 10,
  mismatch_interval_min: 5,
  verify_window_min: 5,
  recheck_before_end_min: 10,
  recheck_window_min: 4,
  count_tolerance: 1,
  stable_count_seconds: 60,
  left_early_counts_as: "absent",
  late_weight: 1,
  lock_after_hours: 48,
  appeal_days: 7,
  gate_accept_threshold: 0.45,
  gate_min_margin: 0.08,
  gate_min_votes: 2,
  verify_threshold: 0.5,
  gps_max_accuracy_m: 40,
  qr_slot_seconds: 20,
  warn_attendance_pct: [85, 75],
};

describe("zod schemas", () => {
  it("course code is upper-cased and validated", () => {
    expect(courseSchema.parse({ code: "iot401", title: "Internet of Things" }).code).toBe("IOT401");
    expect(courseSchema.safeParse({ code: "x", title: "Too short code" }).success).toBe(false);
    expect(courseSchema.parse({ code: "AB1", title: "Okay", credits: "3" }).credits).toBe(3);
  });

  it("semester end must not precede start", () => {
    expect(semesterSchema.safeParse({ name: "2026 Fall", starts_on: "2026-09-01", ends_on: "2026-12-20" }).success).toBe(true);
    const bad = semesterSchema.safeParse({ name: "Bad", starts_on: "2026-12-01", ends_on: "2026-09-01" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.path).toEqual(["ends_on"]);
  });

  it("timetable slot needs HH:MM and end after start", () => {
    expect(timetableSlotSchema.safeParse({ section_id: ID, weekday: "3", start_time: "10:30", end_time: "11:45" }).success).toBe(true);
    expect(timetableSlotSchema.safeParse({ section_id: ID, weekday: "3", start_time: "11:45", end_time: "10:30" }).success).toBe(false);
    expect(timetableSlotSchema.safeParse({ section_id: ID, weekday: "8", start_time: "10:30", end_time: "11:45" }).success).toBe(false);
    expect(timetableSlotSchema.safeParse({ section_id: ID, weekday: "1", start_time: "25:00", end_time: "26:00" }).success).toBe(false);
  });

  it("room: checkbox and geofence JSON are parsed", () => {
    const r = roomSchema.parse({
      code: "b204",
      max_gps_accuracy_m: "40",
      require_qr: "on",
      geofence: JSON.stringify([[127.1, 37.5], [127.2, 37.5], [127.2, 37.6]]),
    });
    expect(r.code).toBe("B204");
    expect(r.require_qr).toBe(true);
    expect(r.geofence).toHaveLength(3);
    expect(roomSchema.parse({ code: "B1", require_qr: undefined }).require_qr).toBe(false);
    expect(roomSchema.safeParse({ code: "B1", geofence: JSON.stringify([[1, 2]]) }).success).toBe(false);
  });

  it("person: email lower-cased, role defaults to student, invalid role rejected", () => {
    const p = personSchema.parse({ email: "Kim@Uni.AC.kr", full_name: "Kim Min" });
    expect(p.email).toBe("kim@uni.ac.kr");
    expect(p.role).toBe("student");
    expect(personSchema.safeParse({ email: "a@b.co", full_name: "Ab", role: "device" }).success).toBe(false);
  });

  it("enrollment requires at least one student", () => {
    expect(enrollmentSchema.safeParse({ section_id: ID, student_ids: [], starts_on: "2026-09-01" }).success).toBe(false);
    expect(enrollmentSchema.safeParse({ section_id: ID, student_ids: [ID], starts_on: "2026-09-01" }).success).toBe(true);
  });

  it("the seeded default policy is valid; inconsistent policies are rejected", () => {
    expect(policySchema.safeParse(DEFAULT_POLICY).success).toBe(true);
    expect(policySchema.parse(DEFAULT_POLICY).door_marks_until_min).toBe(15); // older saved policies get the default
    expect(policySchema.safeParse({ ...DEFAULT_POLICY, door_marks_until_min: 0 }).success).toBe(false);
    expect(policySchema.safeParse({ ...DEFAULT_POLICY, late_until_min: 5 }).success).toBe(false);
    expect(policySchema.safeParse({ ...DEFAULT_POLICY, warn_attendance_pct: [70, 85] }).success).toBe(false);
    expect(policySchema.safeParse({ ...DEFAULT_POLICY, verify_threshold: 1.5 }).success).toBe(false);
  });

  it("camera geometry: normalised points, ROI ≥ 3, line = 2", () => {
    expect(cameraGeometrySchema.safeParse({ camera_id: ID, roi: [[0, 0], [1, 0], [1, 1]], entry_line: [[0, 0.5], [1, 0.5]] }).success).toBe(true);
    expect(cameraGeometrySchema.safeParse({ camera_id: ID, roi: [[0, 0], [2, 0], [1, 1]], entry_line: null }).success).toBe(false);
    expect(cameraGeometrySchema.safeParse({ camera_id: ID, roi: null, entry_line: [[0, 0]] }).success).toBe(false);
  });
});
