"use client";

import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Shows a set-password link once. It is not stored anywhere; it expires per the Auth OTP lifetime. */
export function OneTimeLink({ email, link, onClose }: { email: string; link: string; onClose: () => void }) {
  return (
    <Alert>
      <AlertTitle>Set-password link for {email}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>Give this link to the person. It works once and expires (default 1 hour). It is not shown again.</p>
        <code className="block overflow-x-auto rounded bg-muted p-2 text-xs" data-testid="one-time-link">
          {link}
        </code>
        <div className="flex gap-2">
          <Button
            size="sm"
            type="button"
            onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Copied"))}
          >
            Copy
          </Button>
          <Button size="sm" variant="outline" type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
