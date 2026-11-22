import { describe, expect, it } from "vitest";
import {
  demoSessionSchema, eventBatchSchema, heartbeatSchema, MAX_BATCH, replaySessionSchema, replaySessionsEnabled, roomCodeSchema,
} from "@/lib/edge/schemas";

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

  it("replay session: defaults to 10 min, section must look like IOT401-01, 10..60 min", () => {
    expect(replaySessionSchema.parse({})).toEqual({ minutes: 10 });
    expect(replaySessionSchema.parse({ section: "IOT401-01", minutes: 12 })).toEqual({ section: "IOT401-01", minutes: 12 });
    expect(replaySessionSchema.safeParse({ section: "IOT401" }).success).toBe(false);
    expect(replaySessionSchema.safeParse({ section: "x'; drop--01" }).success).toBe(false);
    expect(replaySessionSchema.safeParse({ minutes: 5 }).success).toBe(false);
    expect(replaySessionSchema.safeParse({ minutes: 61 }).success).toBe(false);
  });

  it("replay sessions are off unless EDGE_REPLAY_SESSIONS=true", () => {
    expect(replaySessionsEnabled({})).toBe(false);
    expect(replaySessionsEnabled({ EDGE_REPLAY_SESSIONS: "1" })).toBe(false);
    expect(replaySessionsEnabled({ EDGE_REPLAY_SESSIONS: "true" })).toBe(true);
  });
});
