import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("rule F: one registered phone", () => {
  it("labels phones for the admin without storing the user agent", async () => {
    const { deviceLabel } = await import("@/lib/device-id");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14) AppleWebKit Chrome/131 Mobile Safari")).toBe("Android · Chrome");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1) AppleWebKit Version/18 Mobile Safari")).toBe("iPhone · Safari");
    expect(deviceLabel("")).toBe("Other · Browser");
  });

  it("stores only a SHA-256 of the phone id", async () => {
    const { hashDeviceId } = await import("@/lib/verify/device");
    const h = hashDeviceId("6f1c1a52-1111-4a2b-8c3d-000000000001");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("6f1c1a52");
  });

  it("registers the first phone, accepts it again, refuses another one", async () => {
    const { checkStudentDevice, hashDeviceId } = await import("@/lib/verify/device");
    let row: { device_hash: string } | null = null;
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
        insert: async (r: { device_hash: string }) => {
          row = { device_hash: r.device_hash };
          return { error: null };
        },
      }),
    } as unknown as Parameters<typeof checkStudentDevice>[0];
    expect(await checkStudentDevice(admin, "s1", "phone-a", "Android · Chrome")).toEqual({ ok: true, registered: true });
    expect(row).toEqual({ device_hash: hashDeviceId("phone-a") });
    expect(await checkStudentDevice(admin, "s1", "phone-a", "Android · Chrome")).toEqual({ ok: true, registered: false });
    expect(await checkStudentDevice(admin, "s1", "phone-b", "iPhone · Safari")).toEqual({ ok: false });
  });
});
