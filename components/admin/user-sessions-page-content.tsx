"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { UserSessionsDashboard } from "@/components/admin/user-sessions-dashboard";

export function UserSessionsPageContent() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("user_id")?.trim() ?? "";

  if (!userId) {
    return (
      <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-5 text-sm text-amber-900 dark:text-amber-200">
        <p className="text-xs font-semibold uppercase tracking-[0.18em]">Attention</p>
        <p className="mt-2">Paramètre utilisateur manquant. Reprenez depuis la page principale des analytics.</p>
        <Link className="mt-4 inline-flex text-sm font-medium underline underline-offset-2" href="/admin/analytics">
          Retour au cockpit
        </Link>
      </div>
    );
  }

  return <UserSessionsDashboard userId={userId} />;
}
