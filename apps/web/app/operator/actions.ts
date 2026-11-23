"use server";

import { streamUrlSchema } from "@/lib/camera-source";
import { z } from "zod";
import { check, formAction } from "@/lib/admin-action";
import { generateDeviceKey } from "@/lib/device-key";
import { cameraGeometrySchema, deviceSchema } from "@/lib/validation";

const OPS = ["operator", "admin"] as const;

export const createDevice = formAction({
  roles: [...OPS],
  schema: deviceSchema,
  revalidate: "/operator",
  run: async (input, { supabase }) => {
    const { key, hash } = generateDeviceKey();
    const { data } = check(await supabase.from("edge_devices").insert({ ...input, api_key_hash: hash }).select("id").single());
    return { ok: true, message: `Device ${input.name} created.`, data: { key, device_id: data!.id, name: input.name } };
  },
});

export const rotateDeviceKey = formAction({
  roles: [...OPS],
  schema: z.object({ id: z.guid(), name: z.string() }),
  revalidate: "/operator",
  run: async ({ id, name }, { supabase }) => {
    const { key, hash } = generateDeviceKey();
    check(await supabase.from("edge_devices").update({ api_key_hash: hash }).eq("id", id));
    return { ok: true, message: `New key for ${name}. The old key stopped working.`, data: { key, device_id: id, name } };
  },
});

export const setDeviceActive = formAction({
  roles: [...OPS],
  schema: z.object({ id: z.guid(), active: z.enum(["true", "false"]) }),
  revalidate: "/operator",
  run: async ({ id, active }, { supabase }) => {
    check(await supabase.from("edge_devices").update({ is_active: active === "true" }).eq("id", id));
    return active === "true" ? "Device enabled." : "Device disabled (its key is rejected).";
  },
});

export const addCamera = formAction({
  roles: [...OPS],
  schema: z.object({
    device_id: z.guid(),
    kind: z.enum(["gate", "inside"]),
    stream_url: z.string().trim().max(300).optional(),
  }),
  revalidate: "/operator",
  run: async (input, { supabase }) => {
    check(await supabase.from("cameras").insert({ ...input, stream_url: input.stream_url ?? null }));
    return `${input.kind} camera added.`;
  },
});

export const deleteCamera = formAction({
  roles: [...OPS],
  schema: z.object({ id: z.guid() }),
  revalidate: "/operator",
  run: async ({ id }, { supabase }) => {
    check(await supabase.from("cameras").delete().eq("id", id));
    return "Camera removed.";
  },
});

/** ROI polygon + entry line, normalised 0..1 to the snapshot image. */
export const saveCameraGeometry = formAction({
  roles: [...OPS],
  schema: z.object({ payload: z.string() }),
  revalidate: "/operator",
  run: async ({ payload }, { supabase }) => {
    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      return { ok: false, message: "Invalid geometry." };
    }
    const parsed = cameraGeometrySchema.safeParse(json);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid geometry." };
    const { camera_id, roi, entry_line, exit_line, door_point } = parsed.data;
    if (exit_line && !door_point) return { ok: false, message: "Click the door side of the exit line too (Door side)." };
    check(await supabase.from("cameras").update({ roi, entry_line, exit_line, door_point }).eq("id", camera_id));
    return "Camera geometry saved. The edge applies it within a minute.";
  },
});

/** The camera's stream address: picked from the cameras the edge found on the Wi-Fi, typed, or "" = automatic. */
export const setCameraStream = formAction({
  roles: [...OPS],
  schema: z.object({ camera_id: z.guid(), stream_url: streamUrlSchema }),
  revalidate: "/operator",
  run: async ({ camera_id, stream_url }, { supabase }) => {
    check(await supabase.from("cameras").update({ stream_url: stream_url || null }).eq("id", camera_id));
    return stream_url ? "Camera address saved. The edge switches within a minute." : "Set to automatic: the edge uses a camera it finds on the Wi-Fi.";
  },
});

/** Turn the camera picture (phone held sideways / upside down). The edge applies it within a minute. */
export const setCameraRotation = formAction({
  roles: [...OPS],
  schema: z.object({ camera_id: z.guid(), rotate: z.coerce.number().int().refine((n) => [0, 90, 180, 270].includes(n)) }),
  revalidate: "/operator",
  run: async ({ camera_id, rotate }, { supabase }) => {
    check(await supabase.from("cameras").update({ rotate }).eq("id", camera_id));
    return `Picture turned to ${rotate}°. The edge applies it within a minute; refresh the live view.`;
  },
});

export const setSnapshotPath = formAction({
  roles: [...OPS],
  schema: z.object({ camera_id: z.guid(), path: z.string().min(3).max(300) }),
  revalidate: "/operator",
  run: async ({ camera_id, path }, { supabase }) => {
    if (!path.startsWith(`${camera_id}/`)) return { ok: false, message: "Unexpected snapshot path." };
    check(await supabase.from("cameras").update({ snapshot_path: path }).eq("id", camera_id));
    return "Snapshot uploaded.";
  },
});
