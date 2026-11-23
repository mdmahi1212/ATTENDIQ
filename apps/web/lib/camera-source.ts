import { z } from "zod";

/** A camera stream address typed or picked on the website: http(s)/rtsp, or "" = automatic (found on the Wi-Fi). */
export const streamUrlSchema = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^(https?|rtsp):\/\/[^\s/]+(:\d+)?(\/\S*)?$/i.test(v), "Use an address like http://phone-address:8080/video");

/** What the edge reported in its heartbeat: cameras found on the Wi-Fi and the address each camera uses now. */
export function edgeCameraStatus(status: unknown): { found: string[]; sources: Record<string, string>; online: Record<string, boolean | null> } {
  const c = (status as { cameras?: { found?: unknown; sources?: unknown; online?: unknown } } | null)?.cameras;
  const found = Array.isArray(c?.found) ? c!.found.filter((u): u is string => typeof u === "string").slice(0, 20) : [];
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const sources = Object.fromEntries(Object.entries(obj(c?.sources)).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const online = Object.fromEntries(Object.entries(obj(c?.online)).map(([k, v]) => [k, typeof v === "boolean" ? v : null]));
  return { found, sources, online };
}
