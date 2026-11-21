import { ScanFace, ShieldCheck, Smartphone, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

const FEATURES = [
  { icon: ScanFace, title: "Face recognition at the door", text: "Walk in and you are marked present in about a second." },
  { icon: Users, title: "Smart room count", text: "The room camera counts people and flags mismatches." },
  { icon: Smartphone, title: "Phone check with liveness", text: "Blink-and-turn challenge plus the rotating room QR." },
  { icon: ShieldCheck, title: "Private by design", text: "Faces stay as encrypted templates; every change is audited." },
];

export function AuthCard({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="aiq-brand-bg relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 size-72 rounded-full bg-cyan-300/10 blur-3xl" />
        <Logo size={40} tone="light" className="relative" />
        <div className="relative max-w-md">
          <h2 className="text-4xl leading-tight font-semibold">Attendance that takes itself.</h2>
          <p className="mt-3 text-white/75">AI at the door, sensors in the room, and a phone check only when it is needed.</p>
          <ul className="aiq-stagger mt-10 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/12 ring-1 ring-white/20">
                  <f.icon className="size-5" />
                </span>
                <span>
                  <span className="block font-medium">{f.title}</span>
                  <span className="text-sm text-white/70">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">AIoT course project · Cisco 7-layer IoT model</p>
      </section>
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="aiq-enter w-full max-w-sm">
          <Logo size={36} className="mb-8 lg:hidden" />
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          <div className="mt-6 space-y-4 rounded-2xl border bg-card p-6 shadow-[0_20px_60px_-30px_rgba(79,70,229,0.45)]">{children}</div>
          {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </section>
    </main>
  );
}
