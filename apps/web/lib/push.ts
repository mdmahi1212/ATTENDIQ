import { z } from "zod";
import type { Json } from "@/lib/database.types";

/** Browser PushSubscription.toJSON() shape, validated before it is stored. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(16).max(256),
    auth: z.string().min(8).max(64),
  }),
});
export type PushSubscriptionJSON = z.infer<typeof pushSubscriptionSchema>;

export const NOTIFICATION_TYPES = [
  "enroll_face",
  "verify_now",
  "recheck_now",
  "marked_late",
  "marked_absent",
  "left_early",
  "appeal_update",
  "low_attendance",
  "class_cancelled",
  "device_offline",
  "count_alert",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Same-origin relative paths only: a push payload must never open an arbitrary site. */
export function isSafePath(p: unknown): p is string {
  return typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") && p.length <= 300;
}

function obj(data: Json | null | undefined): Record<string, Json | undefined> {
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

/** Deep link for a notification: data.url if safe, else a default per type. */
export function deepLink(type: string, data: Json | null | undefined): string {
  const d = obj(data);
  if (isSafePath(d.url)) return d.url;
  switch (type) {
    case "enroll_face":
      return "/student/enroll";
    case "verify_now":
    case "recheck_now":
      return typeof d.request_id === "string" ? `/verify/${d.request_id}` : "/notifications";
    case "marked_late":
    case "marked_absent":
    case "left_early":
    case "low_attendance":
      return "/student/attendance";
    case "appeal_update":
      return "/student/appeals";
    case "class_cancelled":
      return "/student";
    case "device_offline":
      return "/operator";
    case "count_alert":
      return typeof d.session_id === "string" ? `/professor/live/${d.session_id}` : "/professor";
    default:
      return "/notifications";
  }
}

const DEFAULT_TTL_S = 24 * 3600;

/**
 * Push TTL = time left in the notification's window (verify/recheck), so a phone that was offline
 * does not get a stale "verify now" after the window closed. Returns 0 when already expired.
 */
export function ttlSeconds(expiresAt: string | null | undefined, now: Date = new Date()): number {
  if (!expiresAt) return DEFAULT_TTL_S;
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 1000));
}

export function urgencyFor(type: string): "high" | "normal" {
  return type === "verify_now" || type === "recheck_now" || type === "device_offline" ? "high" : "normal";
}

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  type: string;
  tag: string;
  notification_id: string;
  expires_at: string | null;
};

export function buildPayload(n: {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Json | null;
  expires_at: string | null;
}): PushPayload {
  const d = obj(n.data);
  // One visible notification per verify window / per type, newer replaces older.
  const tag = typeof d.request_id === "string" ? `req-${d.request_id}` : `${n.type}-${n.id}`;
  return {
    title: n.title.slice(0, 120),
    body: (n.body ?? "").slice(0, 300),
    url: deepLink(n.type, n.data),
    type: n.type,
    tag,
    notification_id: n.id,
    expires_at: n.expires_at,
  };
}

/** Push services answer 404/410 when a subscription is gone for good: delete it. */
export const isGoneStatus = (status: number | undefined) => status === 404 || status === 410;

/** VAPID public key (base64url) -> Uint8Array for PushManager.subscribe(). */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
