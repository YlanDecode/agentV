import Link from "next/link";
import { ArrowLeftIcon, BarChart3Icon } from "lucide-react";
import { InsightsDashboard } from "@/components/admin/insights-dashboard";

export default function AnalyticsPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border/70 bg-card/70 p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-xs text-muted-foreground">
              <BarChart3Icon className="size-3.5" />
              Tableau de bord opérationnel
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                Analytics & KPI AgentVOCAL
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground md:text-base">
                Suivez en continu les conversations, les usages, les alertes de qualité et la pression de quota.
              </p>
            </div>
          </div>

          <Link
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            href="/admin"
          >
            <ArrowLeftIcon className="size-4" />
            Retour vue d&apos;ensemble
          </Link>
        </div>
      </section>

      <InsightsDashboard />
    </div>
  );
}
