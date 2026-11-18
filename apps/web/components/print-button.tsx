"use client";

import { Button } from "@/components/ui/button";

/** Browser print dialog = printable PDF ("Save as PDF"); the print stylesheet hides navigation and forms. */
export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()} className="print:hidden">
      {label}
    </Button>
  );
}
