"use client";

import Link from "next/link";
import { BanIcon, BotIcon, Clock3Icon, FilterIcon, MessageSquareIcon, RadioTowerIcon, UserRoundIcon, WavesIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  fetchAnalyticsDashboard,
  fetchAnalyticsLive,
  type AnalyticsDashboardFilters,
  type AnalyticsDashboardPayload,
  type AnalyticsHistoryPoint,
  type AnalyticsLiveMessage,
  type AnalyticsLivePayload,
  type AnalyticsLiveSession,
  type AnalyticsQuotaBlock,
} from "@/lib/agentvocal-admin-api";
import { getApiErrorMessage } from "@/lib/axios";

type LoadState = {
  loading: boolean;
  error: string;
  data: AnalyticsDashboardPayload | null;
};

type LiveModeFilter = "all" | "text" | "voice";
type LiveAudienceFilter = "all" | "identified" | "anonymous";

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

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return "jamais";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "recent";
  }

  const diffSeconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (diffSeconds < 10) {
    return "a l'instant";
  }
  if (diffSeconds < 60) {
    return `il y a ${diffSeconds}s`;
  }
  if (diffSeconds < 3600) {
    return `il y a ${Math.floor(diffSeconds / 60)} min`;
  }
  return formatDate(value);
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

function buildAnalyticsQuery(filters: AnalyticsDashboardFilters) {
  const params = new URLSearchParams();
  params.set("days", String(filters.days ?? 14));
  if (filters.mode && filters.mode !== "all") {
    params.set("mode", filters.mode);
  }
  if (filters.audience && filters.audience !== "all") {
    params.set("audience", filters.audience);
  }
  if (filters.channel && filters.channel !== "all") {
    params.set("channel", filters.channel);
  }
  return params.toString();
}

export function InsightsDashboard() {
  const [state, setState] = useState<LoadState>({ loading: true, error: "", data: null });
  const [daysFilter, setDaysFilter] = useState(14);
  const [modeFilter, setModeFilter] = useState<LiveModeFilter>("all");
  const [audienceFilter, setAudienceFilter] = useState<LiveAudienceFilter>("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [freshSessionIds, setFreshSessionIds] = useState<string[]>([]);
  const [freshMessageIds, setFreshMessageIds] = useState<string[]>([]);
  const [lastLiveUpdateAt, setLastLiveUpdateAt] = useState<string | null>(null);
  const previousSessionIdsRef = useRef<string[]>([]);
  const previousMessageIdsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    let highlightTimeout: number | null = null;
    let liveFallbackInterval: number | null = null;
    let liveEventSource: EventSource | null = null;
    const filters: AnalyticsDashboardFilters = {
      days: daysFilter,
      mode: modeFilter,
      audience: audienceFilter,
      channel: channelFilter,
    };

    const loadDashboard = async () => {
      try {
        const data = await fetchAnalyticsDashboard(filters);
        if (cancelled) {
          return;
        }
        previousSessionIdsRef.current = Array.isArray(data.live?.sessions) ? data.live.sessions.map((item) => item.session_id) : [];
        previousMessageIdsRef.current = Array.isArray(data.live?.messages)
          ? data.live.messages.map((item) => `${item.id}-${item.created_at}`)
          : [];
        setFreshSessionIds([]);
        setFreshMessageIds([]);
        setLastLiveUpdateAt(new Date().toISOString());
        setState({ loading: false, error: "", data });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setState({ loading: false, error: getApiErrorMessage(error, "Impossible de charger le cockpit analytics."), data: null });
      }
    };

    const patchLive = (live: AnalyticsLivePayload) => {
      const nextSessionIds = Array.isArray(live.sessions) ? live.sessions.map((item) => item.session_id) : [];
      const nextMessageIds = Array.isArray(live.messages) ? live.messages.map((item) => `${item.id}-${item.created_at}`) : [];
      const nextFreshSessionIds = nextSessionIds.filter((id) => !previousSessionIdsRef.current.includes(id));
      const nextFreshMessageIds = nextMessageIds.filter((id) => !previousMessageIdsRef.current.includes(id));
      previousSessionIdsRef.current = nextSessionIds;
      previousMessageIdsRef.current = nextMessageIds;
      setFreshSessionIds(nextFreshSessionIds);
      setFreshMessageIds(nextFreshMessageIds);
      setLastLiveUpdateAt(new Date().toISOString());
      if (highlightTimeout) {
        window.clearTimeout(highlightTimeout);
      }
      highlightTimeout = window.setTimeout(() => {
        setFreshSessionIds([]);
        setFreshMessageIds([]);
      }, 7000);

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
              active_users: live.active_users,
              active_anonymous_users: live.active_anonymous_users,
              active_identified_users: live.active_identified_users,
              peak_concurrent_sessions_today: live.peak_concurrent_sessions_today,
            },
          },
        };
      });
    };

    const loadLive = async () => {
      try {
        const live = await fetchAnalyticsLive(filters);
        if (!cancelled) {
          patchLive(live);
        }
      } catch {
        // Le dashboard complet reste la source de verite si le live rate ponctuellement.
      }
    };

    const stopFallbackPolling = () => {
      if (liveFallbackInterval) {
        window.clearInterval(liveFallbackInterval);
        liveFallbackInterval = null;
      }
    };

    const startFallbackPolling = () => {
      if (liveFallbackInterval) {
        return;
      }
      liveFallbackInterval = window.setInterval(() => {
        void loadLive();
      }, 5000);
    };

    const startLiveStream = () => {
      const query = buildAnalyticsQuery(filters);
      liveEventSource = new EventSource(query ? `/api/analytics/live/stream?${query}` : "/api/analytics/live/stream");
      liveEventSource.addEventListener("live", (event) => {
        stopFallbackPolling();
        try {
          const live = JSON.parse((event as MessageEvent).data) as AnalyticsLivePayload;
          if (!cancelled) {
            patchLive(live);
          }
        } catch {
          // Ignore malformed event payloads and keep the stream alive.
        }
      });
      liveEventSource.onerror = () => {
        if (liveEventSource) {
          liveEventSource.close();
          liveEventSource = null;
        }
        startFallbackPolling();
      };
    };

    void loadDashboard();
    startLiveStream();
    const dashboardInterval = window.setInterval(() => {
      void loadDashboard();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(dashboardInterval);
      stopFallbackPolling();
      if (liveEventSource) {
        liveEventSource.close();
      }
      if (highlightTimeout) {
        window.clearTimeout(highlightTimeout);
      }
    };
  }, [daysFilter, modeFilter, audienceFilter, channelFilter]);

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
  const live = (state.data?.live ?? {}) as AnalyticsLivePayload;
  const liveSessions = Array.isArray(live.sessions) ? live.sessions : [];
  const liveMessages = Array.isArray(live.messages) ? live.messages : [];
  const channelOptions = Array.from(new Set([...(channelFilter !== "all" ? [channelFilter] : []), ...liveSessions.map((item) => String(item.channel || "web"))]));
  const filteredSessions = liveSessions.filter((item) => {
    if (modeFilter !== "all" && item.mode !== modeFilter) {
      return false;
    }
    if (audienceFilter === "identified" && item.is_anonymous) {
      return false;
    }
    if (audienceFilter === "anonymous" && !item.is_anonymous) {
      return false;
    }
    if (channelFilter !== "all" && item.channel !== channelFilter) {
      return false;
    }
    return true;
  }).sort((left, right) => {
    const leftFresh = freshSessionIds.includes(left.session_id) ? 1 : 0;
    const rightFresh = freshSessionIds.includes(right.session_id) ? 1 : 0;
    if (leftFresh !== rightFresh) {
      return rightFresh - leftFresh;
    }
    const leftScore = left.response_count + left.message_count + left.fallback_count * 2 + left.error_count * 3;
    const rightScore = right.response_count + right.message_count + right.fallback_count * 2 + right.error_count * 3;
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
    return String(right.last_activity_at || "").localeCompare(String(left.last_activity_at || ""));
  });
  const filteredMessages = liveMessages.filter((item) => {
    if (modeFilter !== "all" && item.mode !== modeFilter) {
      return false;
    }
    if (audienceFilter === "identified" && item.is_anonymous) {
      return false;
    }
    if (audienceFilter === "anonymous" && !item.is_anonymous) {
      return false;
    }
    if (channelFilter !== "all" && item.channel !== channelFilter) {
      return false;
    }
    return true;
  });
  const today = history.at(-1);

  return (
    <div className="space-y-6">
      <Panel title="Perimetre" subtitle="La periode et les filtres recalculent les KPI, les listes et le graphique cote serveur.">
        <div className="flex flex-wrap gap-2">
          {[1, 7, 14, 30].map((days) => (
            <FilterChip active={daysFilter === days} key={days} onClick={() => setDaysFilter(days)}>
              {days}j
            </FilterChip>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={BotIcon} label="Conversations sur la periode" value={metric(summary.sessions_today)} helper={`${metric(daysFilter)} jour(s) analyses`} />
        <MetricCard icon={RadioTowerIcon} label="Sessions visibles maintenant" value={metric(summary.active_sessions)} helper={`Fenetre glissante ${metric(live.window_minutes ?? 5)} min`} />
        <MetricCard icon={Clock3Icon} label="Temps total d'usage" value={formatDuration(toNumber(summary.total_duration_seconds))} helper={`Cumule sur ${metric(daysFilter)} jour(s)`} />
        <MetricCard icon={BanIcon} label="Blocages quota periode" value={metric(quota.blocks_today)} helper={quotaReasonLabel(String(quota.most_common_reason || ""))} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={UserRoundIcon} label="Utilisateurs actifs" value={metric(summary.active_users)} helper={`${metric(summary.active_identified_users)} identifies · ${metric(summary.active_anonymous_users)} anonymes`} />
        <MetricCard icon={WavesIcon} label="Sessions vocales live" value={metric(summary.active_voice_sessions)} helper="Websocket et activite recente" />
        <MetricCard icon={MessageSquareIcon} label="Sessions texte live" value={metric(summary.active_text_sessions)} helper="Derniers messages detectes" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel title="Graphique d'usage" subtitle={`Visualise l'activite des ${metric(daysFilter)} derniers jours pour comprendre les volumes et les incidents.`}>
          <UsageChart data={history} />
        </Panel>

        <Panel title="Charge en direct" subtitle="Sait quand l'agent approche de ses limites operationnelles selon les filtres actifs.">
          <div className="grid gap-3 text-sm text-muted-foreground">
            <InfoRow label="Sessions actives maintenant" value={metric(summary.active_sessions)} />
            <InfoRow label="Utilisateurs actifs maintenant" value={metric(summary.active_users)} />
            <InfoRow label="Anonymes actifs" value={metric(summary.active_anonymous_users)} />
            <InfoRow label="Identifies actifs" value={metric(summary.active_identified_users)} />
            <InfoRow label="Sessions voix actives" value={metric(summary.active_voice_sessions)} />
            <InfoRow label="Sessions texte actives" value={metric(summary.active_text_sessions)} />
            <InfoRow label="Pic simultane du jour" value={metric(summary.peak_concurrent_sessions_today)} />
            <InfoRow label="Sessions a revoir" value={metric(summary.sessions_needing_review)} />
            <InfoRow label="Fallback du jour" value={`${Math.round(toNumber(summary.fallback_rate) * 100)} %`} />
            <InfoRow label="Erreurs du jour" value={`${Math.round(toNumber(summary.error_rate) * 100)} %`} />
          </div>
        </Panel>
      </div>

      <Panel title="Cockpit live" subtitle="Sessions et messages recents. Les filtres s'appliquent sans recharger la page.">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <FilterIcon className="size-3.5" />
            Filtres dynamiques
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            <span className="size-2 rounded-full bg-emerald-400" />
            Live {lastLiveUpdateAt ? formatRelativeTime(lastLiveUpdateAt) : "en attente"}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {freshSessionIds.length > 0 ? <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-sky-300">+{freshSessionIds.length} session(s)</span> : null}
            {freshMessageIds.length > 0 ? <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-emerald-300">+{freshMessageIds.length} message(s)</span> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterChip active={modeFilter === "all"} onClick={() => setModeFilter("all")}>Tout</FilterChip>
            <FilterChip active={modeFilter === "text"} onClick={() => setModeFilter("text")}>Texte</FilterChip>
            <FilterChip active={modeFilter === "voice"} onClick={() => setModeFilter("voice")}>Vocal</FilterChip>
            <FilterChip active={audienceFilter === "all"} onClick={() => setAudienceFilter("all")}>Tous</FilterChip>
            <FilterChip active={audienceFilter === "identified"} onClick={() => setAudienceFilter("identified")}>Identifies</FilterChip>
            <FilterChip active={audienceFilter === "anonymous"} onClick={() => setAudienceFilter("anonymous")}>Anonymes</FilterChip>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          <FilterChip active={channelFilter === "all"} onClick={() => setChannelFilter("all")}>Tous canaux</FilterChip>
          {channelOptions.map((channel) => (
            <FilterChip active={channelFilter === channel} key={channel} onClick={() => setChannelFilter(channel)}>
              {channel}
            </FilterChip>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <LiveSessionsList highlightedIds={freshSessionIds} items={filteredSessions} />
          <LiveMessagesList highlightedIds={freshMessageIds} items={filteredMessages} />
        </div>
      </Panel>

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

        <Panel title="Resume de la periode" subtitle="Version simple pour une lecture non technique.">
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

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function LiveSessionsList({ items, highlightedIds }: { items: AnalyticsLiveSession[]; highlightedIds: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune session ne correspond aux filtres en ce moment.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const userLabel = item.is_anonymous ? "Anonyme" : item.user_id || "Utilisateur";
        const isHighlighted = highlightedIds.includes(item.session_id);
        return (
          <div className={`rounded-2xl border bg-card/50 p-4 transition-all ${isHighlighted ? "border-emerald-400/60 shadow-[0_0_0_1px_rgba(74,222,128,0.25)]" : "border-border"}`} key={item.session_id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{item.session_id}</p>
                <p className="mt-1 text-xs text-muted-foreground">{userLabel} · {item.channel} · {item.mode}</p>
              </div>
              <div className="flex items-center gap-2">
                {isHighlighted ? <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300">nouveau</span> : null}
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${item.session_state === "active" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                  {item.session_state === "active" ? "en cours" : "recent"}
                </span>
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <InfoRow label="Derniere activite" value={formatRelativeTime(item.last_activity_at)} />
              <InfoRow label="Messages / reponses" value={`${metric(item.message_count)} / ${metric(item.response_count)}`} />
              <InfoRow label="Fallback" value={metric(item.fallback_count)} />
              <InfoRow label="Erreurs" value={metric(item.error_count)} />
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>Debut: {formatDate(item.started_at)}</span>
              <span>Maj: {formatDate(item.last_activity_at)}</span>
            </div>
            <Link className="mt-3 inline-flex text-xs font-medium text-foreground underline underline-offset-2" href={`/admin/analytics/sessions/${encodeURIComponent(item.session_id)}`}>
              Ouvrir la session
            </Link>
          </div>
        );
      })}
    </div>
  );
}

function LiveMessagesList({ items, highlightedIds }: { items: AnalyticsLiveMessage[]; highlightedIds: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun message recent ne correspond aux filtres.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const itemKey = `${item.id}-${item.created_at}`;
        const isHighlighted = highlightedIds.includes(itemKey);
        return (
          <div className={`rounded-2xl border bg-card/50 p-4 transition-all ${isHighlighted ? "border-sky-400/60 shadow-[0_0_0_1px_rgba(56,189,248,0.25)]" : "border-border"}`} key={itemKey}>
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{item.role} · {item.mode} · {item.channel}</span>
              <div className="flex items-center gap-2">
                {isHighlighted ? <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300">nouveau</span> : null}
                <span>{formatRelativeTime(item.created_at)}</span>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-foreground">{item.content}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>{item.is_anonymous ? "Anonyme" : item.user_id || "Utilisateur"}</span>
              {item.session_id ? <span>Session: {item.session_id}</span> : null}
            </div>
          </div>
        );
      })}
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
