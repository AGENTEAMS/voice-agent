import { Dashboard } from "@/components/dashboard";
import { ensureStarted, getSnapshot } from "@/lib/live-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Server component: warm the live store and hand the client an initial snapshot
// so the first paint already shows data (no empty flash before SSE connects).
export default async function Page() {
  await ensureStarted();
  const initial = getSnapshot();
  return <Dashboard initial={initial} />;
}
