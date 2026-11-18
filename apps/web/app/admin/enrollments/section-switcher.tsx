"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";

export function SectionSwitcher({ sections, current }: { sections: { value: string; label: string }[]; current: string }) {
  const router = useRouter();
  return (
    <div className="mb-4 grid max-w-md gap-1.5">
      <Label htmlFor="section-switch">Section</Label>
      <select
        id="section-switch"
        value={current}
        onChange={(e) => router.push(`/admin/enrollments?section=${e.target.value}`)}
        className="h-8 rounded-lg border px-2 text-sm"
      >
        {sections.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
