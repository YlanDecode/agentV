import { Suspense } from "react";
import { SessionLegacyRedirect } from "@/components/admin/session-legacy-redirect";

export default function SessionDetailPage() {
  return (
    <Suspense fallback={<div className="h-28 animate-pulse rounded-3xl bg-card/60" />}>
      <SessionLegacyRedirect />
    </Suspense>
  );
}
