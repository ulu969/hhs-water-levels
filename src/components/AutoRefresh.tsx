"use client";

import { useRouter } from "next/navigation";
import { useVisibleInterval } from "@/lib/useVisibleInterval";

// Periodically re-runs the server component tree so newly ingested readings
// show up without a manual reload. This is plain client-side polling, not
// the browser's PeriodicSyncManager: that API only fires for an installed,
// standalone PWA and gives no guarantee of running at all, which doesn't fit
// a page meant to stay live in an ordinary browser tab. Background tabs don't
// poll, and catch up as soon as they're shown again.
export default function AutoRefresh({
  children,
  intervalSeconds,
}: {
  children: React.ReactNode;
  intervalSeconds: number;
}) {
  const router = useRouter();

  useVisibleInterval(() => router.refresh(), intervalSeconds * 1000);

  return <>{children}</>;
}
