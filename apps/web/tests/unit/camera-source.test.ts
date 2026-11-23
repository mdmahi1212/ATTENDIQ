import { describe, expect, it } from "vitest";
import { edgeCameraStatus, streamUrlSchema } from "@/lib/camera-source";

describe("camera address", () => {
  it("accepts stream addresses and empty (= automatic) only", () => {
    expect(streamUrlSchema.safeParse("http://192.168.1.20:8080/video").success).toBe(true);
    expect(streamUrlSchema.safeParse("rtsp://cam.local:554/live").success).toBe(true);
    expect(streamUrlSchema.safeParse("").success).toBe(true);
    expect(streamUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(streamUrlSchema.safeParse("http://a b/video").success).toBe(false);
    expect(streamUrlSchema.safeParse("http://<phone-1-ip>:8080/video").success).toBe(false); // placeholder
  });

  it("reads what the edge reported, ignoring junk", () => {
    const s = edgeCameraStatus({ cameras: { found: ["http://10.0.0.2:8080/video", 5], sources: { gate: "http://10.0.0.2:8080/video", inside: 3 }, online: { gate: true, inside: "x" } } });
    expect(s).toEqual({ found: ["http://10.0.0.2:8080/video"], sources: { gate: "http://10.0.0.2:8080/video" }, online: { gate: true, inside: null } });
    expect(edgeCameraStatus(null)).toEqual({ found: [], sources: {}, online: {} });
  });
});
