"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { urlBase64ToUint8Array } from "@/lib/push";
import { detectIOS, pushState, type PushState } from "@/lib/push-support";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function readEnv(): PushState {
  return pushState({
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
    isIOS: detectIOS(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    isStandalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    isSecure: window.isSecureContext,
    permission: "Notification" in window ? Notification.permission : "unsupported",
  });
}

async function registration() {
  // In dev the SW is not auto-registered; register on demand so the flow can be tried on localhost.
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

/** Enable / disable push for this device, with clear guidance when it cannot work. */
export function PushToggle() {
  const [state, setState] = useState<PushState | "loading">("loading");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const s = readEnv();
    let sub = false;
    if (s === "ready") {
      const reg = await navigator.serviceWorker.getRegistration("/");
      sub = Boolean(await reg?.pushManager.getSubscription());
    }
    return { s, sub };
  }, []);

  useEffect(() => {
    let alive = true;
    refresh().then(({ s, sub }) => {
      if (!alive) return;
      setState(s);
      setSubscribed(sub);
    });
    return () => {
      alive = false;
    };
  }, [refresh]);

  async function enable() {
    if (!VAPID) return toast.error("Push is not configured on this server (missing VAPID key).");
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "ready");
        return toast.error("Notifications were not allowed.");
      }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID) }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setSubscribed(true);
      toast.success("Notifications are on for this device.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success("Notifications are off for this device.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;

  if (state === "ios-install") {
    return (
      <Alert data-testid="ios-install-hint">
        <AlertTitle>Add this app to your Home Screen first</AlertTitle>
        <AlertDescription>
          On iPhone, notifications only work for installed web apps (iOS 16.4+): tap the Share button{" "}
          <span aria-hidden>⎋</span> in Safari → <strong>Add to Home Screen</strong>, open the app from the new icon, then
          come back to this page.
        </AlertDescription>
      </Alert>
    );
  }
  if (state === "insecure") {
    return <p className="text-sm text-muted-foreground">Notifications need HTTPS. Open the deployed https:// address.</p>;
  }
  if (state === "unsupported") {
    return <p className="text-sm text-muted-foreground">This browser does not support web push. The in-app inbox below still works.</p>;
  }
  if (state === "denied") {
    return (
      <p className="text-sm text-muted-foreground">
        Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then reload.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="push-toggle">
      <span>{subscribed ? "🔔 Notifications are on for this device." : "Get verify-now and attendance alerts on this device."}</span>
      {subscribed ? (
        <Button size="sm" variant="outline" onClick={disable} disabled={busy}>
          Turn off
        </Button>
      ) : (
        <Button size="sm" onClick={enable} disabled={busy}>
          {busy ? "Enabling…" : "Enable notifications"}
        </Button>
      )}
    </div>
  );
}
