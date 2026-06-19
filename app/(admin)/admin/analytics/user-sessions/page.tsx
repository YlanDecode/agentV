import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeftIcon, UserRoundIcon } from "lucide-react";
import { UserSessionsPageContent } from "@/components/admin/user-sessions-page-content";

export default function UserSessionsPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border/70 bg-card/70 p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-xs text-muted-foreground">
              <UserRoundIcon className="size-3.5" />
              Analyse par utilisateur
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Sessions détaillées</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground md:text-base">
                Consultez toutes les sessions d&apos;un utilisateur et ouvrez chaque transcript pour diagnostiquer rapidement.
              </p>
            </div>
          </div>

          <Link
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            href="/admin/analytics"
          >
            <ArrowLeftIcon className="size-4" />
            Retour cockpit
          </Link>
        </div>
      </section>

      <Suspense fallback={<div className="h-28 animate-pulse rounded-3xl bg-card/60" />}>
        <UserSessionsPageContent />
      </Suspense>
    </div>
  );
}
