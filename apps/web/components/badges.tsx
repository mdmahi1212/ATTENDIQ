import { cn } from "@/lib/utils";
import {
  ATT_STATUS_CLASS,
  ATT_STATUS_LABEL,
  FACE_STATUS_CLASS,
  SIM_CLASS,
  type AttStatus,
  type FaceStatus,
} from "@/lib/status";

const base = "inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap";

export function StatusBadge({ status }: { status: AttStatus }) {
  return <span className={cn(base, ATT_STATUS_CLASS[status])}>{ATT_STATUS_LABEL[status]}</span>;
}

export function SimBadge() {
  return (
    <span className={cn(base, SIM_CLASS)} title="Simulated student">
      SIM
    </span>
  );
}

export function FaceBadge({ status }: { status: string }) {
  const s = (status in FACE_STATUS_CLASS ? status : "pending") as FaceStatus;
  return <span className={cn(base, FACE_STATUS_CLASS[s])}>{s}</span>;
}

export function Pill({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "green" | "amber" | "red" | "blue" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-700 border-gray-300",
    green: "bg-green-100 text-green-800 border-green-300",
    amber: "bg-amber-100 text-amber-900 border-amber-300",
    red: "bg-red-100 text-red-800 border-red-300",
    blue: "bg-blue-100 text-blue-800 border-blue-300",
  };
  return <span className={cn(base, tones[tone])}>{children}</span>;
}
