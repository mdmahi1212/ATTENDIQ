/** What the push UI should show, derived from browser capabilities (pure, unit-tested). */
export type PushEnv = {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  isSecure: boolean;
  permission: "default" | "granted" | "denied" | "unsupported";
};

export type PushState = "insecure" | "ios-install" | "unsupported" | "denied" | "ready";

export function pushState(env: PushEnv): PushState {
  if (!env.isSecure) return "insecure";
  // iOS only exposes Web Push to web apps added to the Home Screen (iOS 16.4+).
  if (env.isIOS && !env.isStandalone) return "ios-install";
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return "unsupported";
  if (env.permission === "denied") return "denied";
  return "ready";
}

/** iPadOS 13+ reports itself as Mac; touch points tell them apart. */
export function detectIOS(userAgent: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}
