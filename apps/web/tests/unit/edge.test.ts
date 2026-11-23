import { describe, expect, it } from "vitest";
import { demoSessionSchema, eventBatchSchema, heartbeatSchema, MAX_BATCH, roomCodeSchema } from "@/lib/edge/schemas";

describe("edge API schemas", () => {
  const ev = { event_id: "0f6c0000-0000-4000-8000-000000000001", event_type: "GATE_ENTRY_RECOGNISED" };
  it("accepts a bare array or {events}", () => {
    expect(eventBatchSchema.parse([ev])).toEqual([ev]);
    expect(eventBatchSchema.parse({ events: [ev] })).toEqual([ev]);
  });
  it("rejects more than 500 events and non-object items", () => {
    expect(eventBatchSchema.safeParse(Array.from({ length: MAX_BATCH + 1 }, () => ev)).success).toBe(false);
    expect(eventBatchSchema.safeParse(["x"]).success).toBe(false);
    expect(eventBatchSchema.safeParse(null).success).toBe(false);
  });
  it("room codes are short and safe", () => {
    expect(roomCodeSchema.safeParse("B204").success).toBe(true);
    expect(roomCodeSchema.safeParse("B204' or 1=1").success).toBe(false);
    expect(roomCodeSchema.safeParse("").success).toBe(false);
  });
  it("heartbeat defaults and demo session bounds", () => {
    expect(heartbeatSchema.parse({})).toEqual({ status: {} });
    expect(heartbeatSchema.safeParse({ observed_at: "yesterday" }).success).toBe(false);
    expect(demoSessionSchema.parse({})).toEqual({ started_minutes_ago: 0, minutes: 75 });
    expect(demoSessionSchema.safeParse({ minutes: 5 }).success).toBe(false);
    expect(demoSessionSchema.safeParse({ started_minutes_ago: 500 }).success).toBe(false);
  });
});

describe("one-click demo class request", () => {
  it("accepts a section code and 5-15 whole minutes", async () => {
    const { demoClassSchema } = await import("@/lib/edge/schemas");
    expect(demoClassSchema.safeParse({ section: "IOT401-01", minutes: 10 }).success).toBe(true);
    expect(demoClassSchema.safeParse({ section: "IOT401-01", minutes: 5 }).success).toBe(true);
    expect(demoClassSchema.safeParse({ section: "IOT401-01", minutes: 6 }).success).toBe(true);
    expect(demoClassSchema.safeParse({ section: "IOT401-01", minutes: 4 }).success).toBe(false);
    expect(demoClassSchema.safeParse({ section: "IOT401-01", minutes: 6.5 }).success).toBe(false);
    expect(demoClassSchema.safeParse({ section: "IOT401-01", minutes: 75 }).success).toBe(false);
    expect(demoClassSchema.safeParse({ section: "IOT401", minutes: 10 }).success).toBe(false);
    expect(demoClassSchema.safeParse({ section: "iot401-01; drop", minutes: 10 }).success).toBe(false);
  });
});
