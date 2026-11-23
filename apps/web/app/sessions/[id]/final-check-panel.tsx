import { ScanSearch } from "lucide-react";
import type { FinalCheckResult } from "@/lib/final-check";
import { fmtSeoul } from "@/lib/time";
import { RefreshEvery } from "./refresh-every";

/** Result of the final room check (End session): what the room camera saw over ~30 s vs who is marked. */
export function FinalCheckPanel({ check, at, requestedAt }: { check: FinalCheckResult | null; at: string | null; requestedAt: string | null }) {
  const waiting = requestedAt && (!at || Date.parse(at) < Date.parse(requestedAt));
  if (!check && !waiting) return null;
  return (
    <section className="mb-6 rounded-2xl border bg-card p-4 text-sm md:p-5" data-testid="final-check">
      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        <ScanSearch className="size-4 text-primary" /> Final room check
      </h2>
      {waiting ? (
        <p className="text-muted-foreground">
          <RefreshEvery ms={5000} />
          The room camera is counting and recognising everyone (about 40 s since {fmtSeoul(requestedAt!, "HH:mm:ss")}). This page updates by itself.
        </p>
      ) : check ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <p><span className="block text-2xl font-semibold tabular-nums">{check.people_in_room}</span>people in the room{check.people_max > check.people_in_room ? ` (up to ${check.people_max})` : ""}</p>
            <p><span className="block text-2xl font-semibold tabular-nums">{check.marked_present}</span>marked present or late</p>
            <p><span className="block text-2xl font-semibold tabular-nums">{check.recognised}</span>recognised by name</p>
          </div>
          {check.people_in_room !== check.marked_present && (
            <p className="mt-3 rounded-lg bg-amber-50 p-2 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              The count does not match: {check.people_in_room > check.marked_present ? "more people in the room than marked" : "fewer people in the room than marked"}.
            </p>
          )}
          {check.not_seen.length > 0 && <p className="mt-2"><b>Marked but not seen now:</b> {check.not_seen.join(", ")}</p>}
          {check.in_room_not_marked.length > 0 && <p className="mt-1"><b>In the room but not marked:</b> {check.in_room_not_marked.join(", ")}</p>}
          {check.unknown_faces > 0 && <p className="mt-1"><b>Unknown faces:</b> {check.unknown_faces} sighting(s)</p>}
          <p className="mt-3 text-xs text-muted-foreground">
            {check.frames} frames over {Math.round(check.window_s)} s at {at ? fmtSeoul(at, "HH:mm:ss") : ""}. Fix anyone with Mark (manual, audited), then press End session to close the class.
          </p>
        </>
      ) : null}
    </section>
  );
}
