"use client";

import { AlertTriangleIcon, BotIcon, Clock3Icon, GaugeIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchAnalyticsDashboard, type AnalyticsDashboardPayload } from "@/lib/agentvocal-admin-api";
import { getApiErrorMessage } from "@/lib/axios";

type LoadState = {
  loading: boolean;
  error: string;
  data: AnalyticsDashboardPayload | null;
};

function metric(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "0";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

export function InsightsDashboard() {
  const [state, setState] = useState<LoadState>({ loading: true, error: "", data: null });

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchAnalyticsDashboard();
        setState({ loading: false, error: "", data });
      } catch (error) {
        setState({ loading: false, error: getApiErrorMessage(error, "Impossible de charger le cockpit analytics."), data: null });
      }
    };

    void load();
  }, []);

  if (state.loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div className="h-28 animate-pulse rounded-3xl bg-card/60" key={item} />
        ))}
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-5 text-amber-900 dark:text-amber-200">
        <p className="text-xs font-semibold uppercase tracking-[0.18em]">Attention</p>
        <p className="mt-2 text-sm leading-6">{state.error}</p>
      </div>
    );
  }

  const summary = state.data?.summary ?? {};
  const quota = state.data?.quota_overview ?? {};
  const issues = state.data?.open_issues ?? [];
  const missingTopics = state.data?.missing_topics ?? [];
  const topDocuments = state.data?.top_documents ?? [];
  const topUsers = state.data?.top_users ?? [];
  const problemSessions = state.data?.problem_sessions ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={BotIcon} label="Conversations aujourd'hui" value={metric(summary.sessions_today)} />
        <MetricCard icon={GaugeIcon} label="Sessions actives" value={metric(summary.active_sessions)} />
        <MetricCard icon={Clock3Icon} label="Temps total" value={`${metric(summary.total_duration_seconds)} s`} />
        <MetricCard icon={AlertTriangleIcon} label="Sessions à revoir" value={metric(summary.sessions_needing_review)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Ce qui cloche" subtitle="Questions sans bonne couverture, erreurs et sessions à revoir.">
          <ListBlock
            emptyLabel="Aucun problème ouvert détecté."
            items={issues.slice(0, 8).map((issue) => ({
              title: String(issue.issue_type ?? "issue"),
              description: String(issue.description ?? ""),
            }))}
          />
        </Panel>

        <Panel title="Ce qu'il faut ajouter" subtitle="Les sujets ou règles à enrichir en priorité.">
          <ListBlock
            emptyLabel="Aucune recommandation prioritaire pour le moment."
            items={missingTopics.slice(0, 8).map((item) => ({
              title: String(item.topic ?? "Sujet non identifié"),
              description: `${metric(item.occurrences)} occurrence(s)`,
            }))}
          />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Documents RAG utiles" subtitle="Ce qui aide réellement l'agent à répondre.">
          <ListBlock
            emptyLabel="Aucun document utile remonté pour l'instant."
            items={topDocuments.slice(0, 6).map((item) => ({
              title: String(item.document_title ?? "Document"),
              description: `${metric(item.usage_count)} usage(s)`,
            }))}
          />
        </Panel>

        <Panel title="Utilisateurs les plus consommateurs" subtitle="Ceux qui utilisent le plus l'agent aujourd'hui.">
          <ListBlock
            emptyLabel="Aucune consommation utilisateur détectée."
            items={topUsers.slice(0, 6).map((item) => ({
              title: String(item.user_id ?? "Utilisateur"),
              description: `${metric(item.responses_count)} réponses · ${metric(item.voice_seconds)} s voix`,
            }))}
          />
        </Panel>

        <Panel title="Quota / surmenage" subtitle="Surveille les blocages et les pics de charge.">
          <div className="space-y-3 text-sm text-muted-foreground">
            <InfoRow label="Pic simultané du jour" value={metric(summary.peak_concurrent_sessions_today)} />
            <InfoRow label="Blocages quota aujourd'hui" value={metric(quota.blocks_today)} />
            <InfoRow label="Utilisateurs bloqués" value={metric(quota.distinct_users_blocked_today)} />
            <InfoRow label="Raison principale" value={metric(quota.most_common_reason || "Aucune")} />
          </div>
        </Panel>
      </div>

      <Panel title="Conversations à revoir" subtitle="Les sessions qui demandent une action éditoriale ou produit.">
        <ListBlock
          emptyLabel="Aucune session prioritaire à revoir."
          items={problemSessions.slice(0, 10).map((item) => ({
            title: `${String(item.session_id ?? "session")} · ${String(item.mode ?? "text")}`,
            description: `${metric(item.fallback_count)} fallback · ${metric(item.error_count)} erreur(s) · ${String(item.review_reason ?? "À analyser")}`,
          }))}
        />
      </Panel>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof BotIcon; label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-border/70 bg-background/80 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <div className="flex size-11 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground">
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border/70 bg-background/80 p-5 md:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function ListBlock({ items, emptyLabel }: { items: Array<{ title: string; description: string }>; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div className="rounded-2xl border border-border bg-card/50 p-4" key={`${item.title}-${index}`}>
          <p className="text-sm font-medium text-foreground">{item.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card/50 px-3 py-3">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
