"use client";

import { useEffect } from "react";

/** Registers /sw.js in production on https:// or localhost (push needs a secure context). */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const secure = location.protocol === "https:" || location.hostname === "localhost";
    if (!secure) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      /* registration failure only disables push; the in-app inbox still works */
    });
  }, []);
  return null;
}
