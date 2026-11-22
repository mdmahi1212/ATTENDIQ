import "server-only";
import { createHash } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type DeviceCheck = { ok: true; registered: boolean } | { ok: false };

export const hashDeviceId = (id: string) => createHash("sha256").update(id).digest("hex");

/** Rule F: the first self-verify registers the phone; later ones must come from the same phone. */
export async function checkStudentDevice(admin: Admin, studentId: string, deviceId: string, label: string): Promise<DeviceCheck> {
  const hash = hashDeviceId(deviceId);
  const { data } = await admin.from("student_devices").select("device_hash").eq("student_id", studentId).maybeSingle();
  if (data) return data.device_hash === hash ? { ok: true, registered: false } : { ok: false };
  const { error } = await admin.from("student_devices").insert({ student_id: studentId, device_hash: hash, label: label.slice(0, 120) });
  if (error) {
    // Two verifies at once from different phones: re-read and compare.
    const { data: again } = await admin.from("student_devices").select("device_hash").eq("student_id", studentId).maybeSingle();
    return again?.device_hash === hash ? { ok: true, registered: false } : { ok: false };
  }
  return { ok: true, registered: true };
}
