import type { RoomPerson } from "@/lib/room-map";

/** Live room map: one dot per person the room camera sees, named when the body tracker knows their face. */
export function RoomMap({ people, names, at }: { people: RoomPerson[]; names: Map<string, string>; at: string | null }) {
  return (
    <div>
      <svg viewBox="0 0 160 90" className="w-full rounded-xl border bg-muted/40" role="img" aria-label="Room map">
        <rect x="1" y="1" width="158" height="88" rx="4" fill="none" className="stroke-border" strokeWidth="0.6" />
        {people.map((p, i) => {
          const name = p.student_id ? names.get(p.student_id) : undefined;
          const x = p.x * 160;
          const y = Math.min(84, p.y * 90);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="3.2" className={name ? "fill-emerald-500" : "fill-slate-400"} opacity="0.9" />
              {name && (
                <text x={x} y={y - 4.5} textAnchor="middle" fontSize="4" className="fill-foreground">
                  {name.split(" ")[0]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-xs text-muted-foreground">
        {people.length} in view · green = known student, grey = not identified yet{at ? ` · ${at}` : ""}. Positions only, no picture.
      </p>
    </div>
  );
}
