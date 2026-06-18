import Link from "next/link";
import { ArrowLeftIcon, UserRoundIcon } from "lucide-react";
import { UserSessionsDashboard } from "@/components/admin/user-sessions-dashboard";

type SearchParams = {
  [key: string]: string | string[] | undefined;
};

type UserSessionsPageProps = {
  searchParams: SearchParams | Promise<SearchParams>;
};

export default async function UserSessionsPage({ searchParams }: UserSessionsPageProps) {
  const params = await searchParams;

  const userId =
    typeof params.user_id === "string"
      ? params.user_id.trim()
      : Array.isArray(params.user_id)
        ? params.user_id[0]?.trim() ?? ""
        : "";

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
                Consultez toutes les sessions d'un utilisateur et ouvrez chaque transcript pour diagnostiquer rapidement.
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

      {userId ? (
        <UserSessionsDashboard userId={userId} />
      ) : (
        <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-5 text-sm text-amber-900 dark:text-amber-200">
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">Attention</p>
          <p className="mt-2">Paramètre utilisateur manquant. Reprenez depuis la page principale des analytics.</p>
          <Link className="mt-4 inline-flex text-sm font-medium underline underline-offset-2" href="/admin/analytics">
            Retour au cockpit
          </Link>
        </div>
      )}
    </div>
  );
}
