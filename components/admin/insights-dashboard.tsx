"use client";

import Link from "next/link";
import { BanIcon, BotIcon, Clock3Icon, RadioTowerIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
  fetchAnalyticsDashboard,
  fetchAnalyticsLive,
  type AnalyticsDashboardPayload,
  type AnalyticsHistoryPoint,
  type AnalyticsLivePayload,
  type AnalyticsQuotaBlock,
} from "@/lib/agentvocal-admin-api";
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

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} h ${String(minutes).padStart(2, "0")}`;
  }
  return `${minutes} min`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(date);
}

function quotaReasonLabel(reason: string) {
  switch (reason) {
    case "max_global_concurrent_sessions_reached":
      return "Capacité globale atteinte";
    case "max_concurrent_sessions_per_user_reached":
      return "Trop de sessions parallèles";
    case "responses_per_hour_exceeded":
      return "Trop de réponses sur 1 h";
    case "responses_per_day_exceeded":
      return "Quota journalier atteint";
    case "voice_seconds_per_day_exceeded":
      return "Temps vocal journalier atteint";
    default:
      return reason || "Blocage quota";
  }
}

export function InsightsDashboard() {
  const [state, setState] = useState<LoadState>({ loading: true, error: "", data: null });

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      try {
        const data = await fetchAnalyticsDashboard();
        if (cancelled) {
          return;
        }
        setState({ loading: false, error: "", data });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setState({ loading: false, error: getApiErrorMessage(error, "Impossible de charger le cockpit analytics."), data: null });
      }
    };

    const patchLive = (live: AnalyticsLivePayload) => {
      setState((current) => {
        if (!current.data) {
          return current;
        }

        return {
          ...current,
          data: {
            ...current.data,
            live,
            summary: {
              ...current.data.summary,
              active_sessions: live.active_sessions,
              active_voice_sessions: live.active_voice_sessions,
              active_text_sessions: live.active_text_sessions,
              peak_concurrent_sessions_today: live.peak_concurrent_sessions_today,
            },
          },
        };
      });
    };

    const loadLive = async () => {
      try {
        const live = await fetchAnalyticsLive();
        if (!cancelled) {
          patchLive(live);
        }
      } catch {
        // Le dashboard complet reste la source de verite si le live rate ponctuellement.
      }
    };

    void loadDashboard();
    const liveInterval = window.setInterval(() => {
      void loadLive();
    }, 5000);
    const dashboardInterval = window.setInterval(() => {
      void loadDashboard();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(liveInterval);
      window.clearInterval(dashboardInterval);
    };
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
  const history = state.data?.activity_history ?? [];
  const quotaBlocks = state.data?.quota_blocks ?? [];
  const today = history.at(-1);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={BotIcon} label="Conversations aujourd'hui" value={metric(summary.sessions_today)} helper="Sessions ouvertes dans la journee" />
        <MetricCard icon={RadioTowerIcon} label="Appels simultanes maintenant" value={metric(summary.active_sessions)} helper="Mise a jour toutes les 5 s" />
        <MetricCard icon={Clock3Icon} label="Temps total d'usage" value={formatDuration(toNumber(summary.total_duration_seconds))} helper="Cumule des sessions du jour" />
        <MetricCard icon={BanIcon} label="Blocages quota aujourd'hui" value={metric(quota.blocks_today)} helper={quotaReasonLabel(String(quota.most_common_reason || ""))} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel title="Graphique d'usage" subtitle="Visualise l'activite des 14 derniers jours pour comprendre les volumes et les incidents.">
          <UsageChart data={history} />
        </Panel>

        <Panel title="Charge en direct" subtitle="Sait quand l'agent approche de ses limites operationnelles.">
          <div className="grid gap-3 text-sm text-muted-foreground">
            <InfoRow label="Sessions actives maintenant" value={metric(summary.active_sessions)} />
            <InfoRow label="Sessions voix actives" value={metric(summary.active_voice_sessions)} />
            <InfoRow label="Sessions texte actives" value={metric(summary.active_text_sessions)} />
            <InfoRow label="Pic simultane du jour" value={metric(summary.peak_concurrent_sessions_today)} />
            <InfoRow label="Sessions a revoir" value={metric(summary.sessions_needing_review)} />
            <InfoRow label="Fallback du jour" value={`${Math.round(toNumber(summary.fallback_rate) * 100)} %`} />
            <InfoRow label="Erreurs du jour" value={`${Math.round(toNumber(summary.error_rate) * 100)} %`} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Ce qui cloche" subtitle="Questions sans bonne couverture, erreurs et sessions a revoir.">
          <ListBlock
            emptyLabel="Aucun probleme ouvert detecte."
            items={issues.slice(0, 8).map((issue) => ({
              title: String(issue.issue_type ?? "issue"),
              description: String(issue.description ?? ""),
            }))}
          />
        </Panel>

        <Panel title="Blocages quota recents" subtitle="Trace les refus automatiques pour comprendre la saturation ou les abus.">
          <QuotaBlocksList items={quotaBlocks.slice(0, 8)} />
        </Panel>

        <Panel title="Ce qu'il faut ajouter" subtitle="Les sujets ou regles a enrichir en priorite.">
          <ListBlock
            emptyLabel="Aucune recommandation prioritaire pour le moment."
            items={missingTopics.slice(0, 8).map((item) => ({
              title: String(item.topic ?? "Sujet non identifie"),
              description: `${metric(item.occurrences)} occurrence(s)`,
            }))}
          />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Documents RAG utiles" subtitle="Ce qui aide reellement l'agent a repondre.">
          <ListBlock
            emptyLabel="Aucun document utile remonte pour l'instant."
            items={topDocuments.slice(0, 6).map((item) => ({
              title: String(item.document_title ?? "Document"),
              description: `${metric(item.usage_count)} usage(s)`,
            }))}
          />
        </Panel>

        <Panel title="Usage par utilisateur" subtitle="Cliquez pour ouvrir les quotas et l'historique d'un utilisateur.">
          <ListBlock
            emptyLabel="Aucune consommation utilisateur detectee."
            items={topUsers.slice(0, 6).map((item) => {
              const userId = String(item.user_id ?? "").trim();
              return {
                title: userId || "Utilisateur inconnu",
                description: `${metric(item.responses_count)} reponses · ${metric(item.total_sessions)} sessions · ${metric(item.blocked_count)} blocage(s)`,
                href: userId ? `/admin/analytics/user-sessions?user_id=${encodeURIComponent(userId)}` : undefined,
              };
            })}
          />
        </Panel>

        <Panel title="Resume du jour" subtitle="Version simple pour une lecture non technique.">
          <div className="space-y-3 text-sm text-muted-foreground">
            <InfoRow label="Messages traites" value={metric(today?.messages ?? summary.responses_today)} />
            <InfoRow label="Reponses produites" value={metric(today?.responses ?? summary.responses_today)} />
            <InfoRow label="Temps vocal consomme" value={`${metric(today?.voice_seconds ?? 0)} s`} />
            <InfoRow label="Sessions problematiques" value={metric(today?.sessions_needing_review ?? summary.sessions_needing_review)} />
            <InfoRow label="Refus automatiques" value={metric(today?.blocked_count ?? quota.blocks_today)} />
          </div>
        </Panel>
      </div>

      <Panel title="Conversations a revoir" subtitle="Les sessions qui demandent une action editoriale ou produit.">
        <ListBlock
          emptyLabel="Aucune session prioritaire a revoir."
          items={problemSessions.slice(0, 10).map((item) => {
            const sessionId = String(item.session_id ?? "").trim();
            return {
              title: `${sessionId || "session"} · ${String(item.mode ?? "text")}`,
              description: `${metric(item.fallback_count)} fallback · ${metric(item.error_count)} erreur(s) · ${String(item.review_reason ?? "A analyser")}`,
              href: sessionId ? `/admin/analytics/sessions/${encodeURIComponent(sessionId)}` : undefined,
            };
          })}
        />
      </Panel>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof BotIcon;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-3xl border border-border/70 bg-background/80 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
          <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
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

function ListBlock({
  items,
  emptyLabel,
}: {
  items: Array<{ title: string; description: string; href?: string }>;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        item.href ? (
          <Link
            className="block rounded-2xl border border-border bg-card/50 p-4 transition-colors hover:border-foreground/30 hover:bg-card"
            href={item.href}
            key={`${item.title}-${index}`}
          >
            <p className="text-sm font-medium text-foreground">{item.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
          </Link>
        ) : (
          <div className="rounded-2xl border border-border bg-card/50 p-4" key={`${item.title}-${index}`}>
            <p className="text-sm font-medium text-foreground">{item.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
          </div>
        )
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

function QuotaBlocksList({ items }: { items: AnalyticsQuotaBlock[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun refus quota recent.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const userId = String(item.user_id ?? "").trim();
        return (
          <div className="rounded-2xl border border-border bg-card/50 p-4" key={item.id}>
            <p className="text-sm font-medium text-foreground">{quotaReasonLabel(item.reason)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{formatDate(item.created_at)} · {userId || "Utilisateur non renseigne"}</p>
            {userId ? (
              <Link className="mt-2 inline-flex text-xs font-medium text-foreground underline underline-offset-2" href={`/admin/analytics/user-sessions?user_id=${encodeURIComponent(userId)}`}>
                Ouvrir la fiche utilisateur
              </Link>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function UsageChart({ data }: { data: AnalyticsHistoryPoint[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Pas encore assez d'historique pour tracer le graphe d'usage.</p>;
  }

  const width = 720;
  const height = 220;
  const padding = 20;
  const maxValue = Math.max(1, ...data.flatMap((item) => [item.responses, item.sessions, item.blocked_count + item.error_count + item.fallback_count]));
  const stepX = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;
  const scaleY = (value: number) => height - padding - (value / maxValue) * (height - padding * 2);
  const line = (selector: (item: AnalyticsHistoryPoint) => number) =>
    data
      .map((item, index) => `${padding + stepX * index},${scaleY(selector(item))}`)
      .join(" ");

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl border border-border bg-card/40 p-3">
        <svg className="h-[220px] w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
          {[0, 1, 2, 3].map((row) => {
            const y = padding + ((height - padding * 2) / 3) * row;
            return <line key={row} x1={padding} x2={width - padding} y1={y} y2={y} stroke="currentColor" strokeDasharray="4 6" className="text-border/80" />;
          })}
          <polyline fill="none" points={line((item) => item.responses)} stroke="currentColor" strokeWidth="3" className="text-foreground" />
          <polyline fill="none" points={line((item) => item.sessions)} stroke="currentColor" strokeWidth="2" className="text-sky-500" />
          <polyline fill="none" points={line((item) => item.blocked_count + item.error_count + item.fallback_count)} stroke="currentColor" strokeWidth="2" className="text-amber-500" />
        </svg>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <LegendCard color="bg-foreground" label="Reponses" description="Volume principal traite par l'agent" />
        <LegendCard color="bg-sky-500" label="Sessions" description="Nombre de conversations ouvertes" />
        <LegendCard color="bg-amber-500" label="Incidents" description="Fallback + erreurs + blocages quota" />
      </div>

      <div className="grid gap-2 md:grid-cols-7">
        {data.map((item) => (
          <div className="rounded-2xl border border-border bg-card/40 px-3 py-3 text-xs text-muted-foreground" key={item.bucket}>
            <p className="font-medium text-foreground">{item.label}</p>
            <p className="mt-1">{item.responses} reponses</p>
            <p>{item.sessions} sessions</p>
            <p>{item.blocked_count + item.error_count + item.fallback_count} incidents</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LegendCard({ color, label, description }: { color: string; label: string; description: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/50 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span className={`size-2.5 rounded-full ${color}`} />
        {label}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
