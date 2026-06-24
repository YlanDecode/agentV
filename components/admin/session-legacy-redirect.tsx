"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export function SessionLegacyRedirect() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();

  useEffect(() => {
    const sessionId = decodeURIComponent(String(params?.sessionId || "").trim());
    if (!sessionId) {
      router.replace("/admin/analytics");
      return;
    }

    router.replace(
      `/admin/analytics/user-sessions?user_id=${encodeURIComponent(`session:${sessionId}`)}&session_id=${encodeURIComponent(sessionId)}`
    );
  }, [params?.sessionId, router]);

  return <div className="h-28 animate-pulse rounded-3xl bg-card/60" />;
}
