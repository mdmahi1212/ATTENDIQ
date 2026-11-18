/* Smart Attendance service worker: Web Push only (no offline caching yet).
 * Payload (from /api/internal/push-dispatch): { title, body, url, type, tag, notification_id, expires_at }
 */
const ICON = "/icons/icon-192.png";
const BADGE = "/icons/badge-96.png";

function safePath(p) {
  return typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") ? p : "/notifications";
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Smart Attendance", body: event.data ? event.data.text() : "" };
  }
  const url = safePath(data.url);
  const expired = data.expires_at && Date.parse(data.expires_at) < Date.now();
  const options = {
    body: expired ? "This request has expired." : data.body || "",
    icon: ICON,
    badge: BADGE,
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    requireInteraction: data.type === "verify_now" || data.type === "recheck_now",
    timestamp: Date.now(),
    data: { url, expires_at: data.expires_at || null, notification_id: data.notification_id || null },
  };
  event.waitUntil(self.registration.showNotification(data.title || "Smart Attendance", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          return w.navigate(target).then((nw) => (nw || w).focus());
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
