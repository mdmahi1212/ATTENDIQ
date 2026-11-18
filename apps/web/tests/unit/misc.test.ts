import { describe, expect, it } from "vitest";
import { changedKeys } from "@/lib/audit";
import { DEVICE_KEY_PATTERN, generateDeviceKey, hashDeviceKey } from "@/lib/device-key";
import { fmtPair, parseHeartbeat } from "@/lib/device-status";
import { findSlotConflicts, slotsOverlap } from "@/lib/schedule";
import { ATT_STATUS_CLASS, deviceHealth } from "@/lib/status";
import { ageSeconds, fmtSeoul, seoulToday, weekdayLabel } from "@/lib/time";

describe("device keys", () => {
  it("match the PowerShell script format and hash as sha256 hex", () => {
    const { key, hash } = generateDeviceKey();
    expect(key).toMatch(DEVICE_KEY_PATTERN);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDeviceKey(key)).toBe(hash);
    // Known vector: sha256("abc")
    expect(hashDeviceKey("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("are unique", () => {
    expect(generateDeviceKey().key).not.toBe(generateDeviceKey().key);
  });
});

describe("timetable overlap", () => {
  const a = { id: "a", weekday: 1, start_time: "10:30:00", end_time: "11:45:00" };
  it("detects overlap on the same day only", () => {
    expect(slotsOverlap(a, { id: "b", weekday: 1, start_time: "11:00", end_time: "12:00" })).toBe(true);
    expect(slotsOverlap(a, { id: "b", weekday: 2, start_time: "11:00", end_time: "12:00" })).toBe(false);
  });
  it("back-to-back slots do not clash", () => {
    expect(slotsOverlap(a, { id: "b", weekday: 1, start_time: "11:45", end_time: "13:00" })).toBe(false);
  });
  it("a slot never conflicts with itself", () => {
    expect(findSlotConflicts([a], [a])).toEqual([]);
  });
});

describe("time helpers (Asia/Seoul)", () => {
  it("formats UTC in KST", () => {
    expect(fmtSeoul("2026-11-18T01:30:00Z")).toBe("2026-11-18 10:30");
    expect(fmtSeoul(null)).toBe("—");
  });
  it("seoulToday rolls over at KST midnight", () => {
    expect(seoulToday(new Date("2026-11-17T15:00:00Z"))).toBe("2026-11-18");
    expect(seoulToday(new Date("2026-11-17T14:59:59Z"))).toBe("2026-11-17");
  });
  it("ISO weekday labels", () => {
    expect(weekdayLabel(1)).toBe("Mon");
    expect(weekdayLabel(7)).toBe("Sun");
  });
  it("age in seconds", () => {
    expect(ageSeconds("2026-01-01T00:00:00Z", new Date("2026-01-01T00:00:42Z"))).toBe(42);
    expect(ageSeconds(null)).toBeNull();
  });
});

describe("status colours and device health", () => {
  it("fixed status colours from the spec", () => {
    expect(ATT_STATUS_CLASS.present).toContain("green");
    expect(ATT_STATUS_CLASS.late).toContain("amber");
    expect(ATT_STATUS_CLASS.absent).toContain("red");
    expect(ATT_STATUS_CLASS.left_early).toContain("orange");
    expect(ATT_STATUS_CLASS.excused).toContain("blue");
    expect(ATT_STATUS_CLASS.pending).toContain("gray");
  });
  it("health thresholds (offline shown within 30 s)", () => {
    expect(deviceHealth(5)).toBe("online");
    expect(deviceHealth(30)).toBe("stale");
    expect(deviceHealth(200)).toBe("offline");
    expect(deviceHealth(null)).toBe("offline");
  });
  it("parses untrusted heartbeat payloads defensively", () => {
    const hb = parseHeartbeat({ cpu: 31.2, fps: { gate: 14.6, inside: "x" }, outbox: 3, evil: { a: 1 } });
    expect(hb).toEqual({ cpu: 31.2, fps: { gate: 14.6, inside: undefined }, frame_age_ms: undefined, outbox: 3, reconnects: undefined });
    expect(parseHeartbeat("nope")).toEqual({});
    expect(fmtPair(hb.fps)).toBe("gate 14.6 · inside —");
  });
});

describe("audit diff", () => {
  it("lists changed fields only, ignoring updated_at", () => {
    expect(
      changedKeys({ status: "pending", note: null, updated_at: "1" }, { status: "present", note: null, updated_at: "2" }),
    ).toEqual([{ key: "status", from: "pending", to: "present" }]);
    expect(changedKeys(null, { a: 1 })).toEqual([{ key: "a", from: "∅", to: "1" }]);
  });
});
