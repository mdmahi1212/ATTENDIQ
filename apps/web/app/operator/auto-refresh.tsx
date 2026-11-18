"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the server page every N seconds (device health). Pauses while the tab is hidden. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [on, seconds, router]);
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> auto-refresh {seconds}s
    </label>
  );
}
