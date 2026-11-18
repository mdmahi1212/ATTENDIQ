import { requireRole } from "@/lib/auth";
import { QrDisplay } from "./qr-display";

// Full-screen rotating room QR for the projector. Rendered outside the app shell (see layout note).
export default async function RoomQrPage({ params }: PageProps<"/sessions/[id]/qr">) {
  await requireRole("professor", "admin");
  const { id } = await params;
  return <QrDisplay sessionId={id} />;
}
