import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const expired = params.error === "link_expired";
  return (
    <AuthCard
      title="Sign in"
      description={expired ? "That link expired or was already used. Sign in or request a new one." : undefined}
      footer={
        <div className="flex justify-between">
          <Link href="/signup" className="hover:underline">
            Student sign up
          </Link>
          <Link href="/reset-password" className="hover:underline">
            Forgot password?
          </Link>
        </div>
      }
    >
      <LoginForm next={next} />
    </AuthCard>
  );
}
