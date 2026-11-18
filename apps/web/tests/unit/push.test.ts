import { describe, expect, it } from "vitest";
import { buildPayload, deepLink, isGoneStatus, isSafePath, pushSubscriptionSchema, ttlSeconds, urgencyFor, urlBase64ToUint8Array } from "@/lib/push";
import { detectIOS, pushState, type PushEnv } from "@/lib/push-support";
import { secretsMatch } from "@/lib/webhook-auth";

describe("deep links", () => {
  it("uses data.url when it is a safe relative path", () => {
    expect(deepLink("enroll_face", { url: "/student/enroll" })).toBe("/student/enroll");
  });
  it("never follows absolute, protocol-relative or backslash URLs", () => {
    expect(isSafePath("https://evil.example")).toBe(false);
    expect(isSafePath("//evil.example")).toBe(false);
    expect(isSafePath("/\\evil")).toBe(false);
    expect(deepLink("marked_late", { url: "https://evil.example" })).toBe("/student/attendance");
  });
  it("falls back to a default per type", () => {
    expect(deepLink("verify_now", { request_id: "abc" })).toBe("/verify/abc");
    expect(deepLink("recheck_now", {})).toBe("/notifications");
    expect(deepLink("enroll_face", null)).toBe("/student/enroll");
    expect(deepLink("count_alert", { session_id: "s1" })).toBe("/professor/live/s1");
    expect(deepLink("device_offline", {})).toBe("/operator");
    expect(deepLink("something_new", {})).toBe("/notifications");
  });
});

describe("TTL, urgency, gone subscriptions", () => {
  const now = new Date("2026-11-18T01:00:00Z");
  it("TTL is the time left in the window; 0 once expired; 24 h when no expiry", () => {
    expect(ttlSeconds("2026-11-18T01:05:00Z", now)).toBe(300);
    expect(ttlSeconds("2026-11-18T00:59:00Z", now)).toBe(0);
    expect(ttlSeconds(null, now)).toBe(86400);
  });
  it("verify/recheck are high urgency", () => {
    expect(urgencyFor("verify_now")).toBe("high");
    expect(urgencyFor("recheck_now")).toBe("high");
    expect(urgencyFor("marked_late")).toBe("normal");
  });
  it("404/410 mean delete the subscription", () => {
    expect(isGoneStatus(404)).toBe(true);
    expect(isGoneStatus(410)).toBe(true);
    expect(isGoneStatus(429)).toBe(false);
    expect(isGoneStatus(undefined)).toBe(false);
  });
});

describe("payload", () => {
  it("one notification per verify window (tag = request id), safe url, trimmed text", () => {
    const p = buildPayload({
      id: "n1",
      type: "verify_now",
      title: "T".repeat(200),
      body: null,
      data: { request_id: "r9", url: "/verify/r9" },
      expires_at: "2026-11-18T01:05:00Z",
    });
    expect(p).toMatchObject({ url: "/verify/r9", tag: "req-r9", body: "", notification_id: "n1" });
    expect(p.title).toHaveLength(120);
  });
});

describe("subscription validation", () => {
  const good = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", expirationTime: null, keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } };
  it("accepts a browser subscription", () => {
    expect(pushSubscriptionSchema.safeParse(good).success).toBe(true);
  });
  it("rejects non-https endpoints and missing keys", () => {
    expect(pushSubscriptionSchema.safeParse({ ...good, endpoint: "http://x.example/push" }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...good, keys: { p256dh: "x" } }).success).toBe(false);
  });
});

describe("VAPID key decoding", () => {
  it("decodes base64url to the raw P-256 point (65 bytes, 0x04 prefix)", () => {
    const key = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
    const bytes = urlBase64ToUint8Array(key);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4);
  });
});

describe("push availability", () => {
  const base: PushEnv = {
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    isIOS: false,
    isStandalone: false,
    isSecure: true,
    permission: "default",
  };
  it("needs HTTPS", () => expect(pushState({ ...base, isSecure: false })).toBe("insecure"));
  it("iPhone in Safari must add to Home Screen first", () => {
    expect(pushState({ ...base, isIOS: true })).toBe("ios-install");
    expect(pushState({ ...base, isIOS: true, isStandalone: true })).toBe("ready");
  });
  it("reports unsupported and denied", () => {
    expect(pushState({ ...base, hasPushManager: false })).toBe("unsupported");
    expect(pushState({ ...base, permission: "denied" })).toBe("denied");
    expect(pushState(base)).toBe("ready");
  });
  it("detects iPhone and iPadOS-as-Mac", () => {
    expect(detectIOS("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5)).toBe(true);
    expect(detectIOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(detectIOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(detectIOS("Mozilla/5.0 (Linux; Android 14)", 5)).toBe(false);
  });
});

describe("webhook secret check", () => {
  it("matches only the exact secret, constant-time, any lengths", () => {
    expect(secretsMatch("s3cret", "s3cret")).toBe(true);
    expect(secretsMatch("s3cre", "s3cret")).toBe(false);
    expect(secretsMatch("", "s3cret")).toBe(false);
    expect(secretsMatch(null, "s3cret")).toBe(false);
    expect(secretsMatch("x", undefined)).toBe(false);
  });
});
