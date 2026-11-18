import Link from "next/link";
import { AuthCard } from "@/components/auth-card";

export default function ForbiddenPage() {
  return (
    <AuthCard title="No access" description="Your account does not have permission to open that page.">
      <Link href="/" className="text-sm hover:underline" data-testid="forbidden">
        Go to my home page
      </Link>
    </AuthCard>
  );
}
