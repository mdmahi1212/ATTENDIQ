import { cn } from "@/lib/utils";

/** AttendIQ mark: scan-frame corners (the camera seeing a face) around a check (attendance confirmed); dot = sensor. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  // Unique per size: a gradient defined inside a hidden (display:none) copy of the logo would not render elsewhere.
  const id = `aiq-g-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7C6CF6" />
          <stop offset="0.55" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#3730A3" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
      <g fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 13V10.5A2 2 0 0 1 10.5 8.5H13" />
        <path d="M19 8.5h2.5a2 2 0 0 1 2 2V13" />
        <path d="M8.5 19v2.5a2 2 0 0 0 2 2H13" />
        <path d="M23.5 19v2.5a2 2 0 0 1-2 2H19" />
        <path d="m12.4 16.3 2.6 2.5 4.8-5.1" strokeWidth="2.5" />
      </g>
      <circle cx="25.6" cy="6.4" r="1.7" fill="#67E8F9" />
    </svg>
  );
}

export function Logo({ size = 32, className, tone = "dark" }: { size?: number; className?: string; tone?: "dark" | "light" }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span className={cn("text-lg font-semibold tracking-tight", tone === "light" ? "text-white" : "text-foreground")}>
        Attend<span className={tone === "light" ? "text-cyan-300" : "text-primary"}>IQ</span>
      </span>
    </span>
  );
}
