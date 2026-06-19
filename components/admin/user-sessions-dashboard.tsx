"use client";

import Link from "next/link";
import { BanIcon, ChevronDownIcon, ChevronUpIcon, Clock3Icon, MessageCircleIcon, MessageSquareIcon, ShieldAlertIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  fetchAnalyticsSessionDetail,
  fetchAnalyticsUserSessions,
  fetchAnalyticsUserUsage,
  type AnalyticsHistoryPoint,
  type AnalyticsQuotaBlock,
  type AnalyticsSessionMessage,
  type AnalyticsUserSessionItem,
  type AnalyticsUserUsagePayload,
} from "@/lib/agentvocal-admin-api";
import { getApiErrorMessage } from "@/lib/axios";

type LoadState = {
  loading: boolean;
  error: string;
  sessions: AnalyticsUserSessionItem[];
  usage: AnalyticsUserUsagePayload | null;
};

function metric(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "0";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
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
    second: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDuration(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}m ${String(remaining).padStart(2, "0")}s`;
}

function quotaReasonLabel(reason: string) {
  switch (reason) {
    case "max_global_concurrent_sessions_reached":
      return "Capacite globale atteinte";
    case "max_concurrent_sessions_per_user_reached":
      return "Trop de sessions paralleles";
    case "responses_per_hour_exceeded":
      return "Trop de reponses sur 1 h";
    case "responses_per_day_exceeded":
      return "Quota journalier atteint";
    case "voice_seconds_per_day_exceeded":
      return "Temps vocal journalier atteint";
    default:
      return reason || "Blocage quota";
  }
}

export function UserSessionsDashboard({ userId }: { userId: string }) {
  const [state, setState] = useState<LoadState>({
    loading: true,
    error: "",
    sessions: [],
    usage: null,
  });
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [transcripts, setTranscripts] = useState<Record<string, { loading: boolean; messages: AnalyticsSessionMessage[]; error: string }>>({});
  const loadingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      try {
        const [sessionsData, usageData] = await Promise.all([
          fetchAnalyticsUserSessions(userId),
          fetchAnalyticsUserUsage(userId),
        ]);
        setState({ loading: false, error: "", sessions: sessionsData.sessions ?? [], usage: usageData });
      } catch (error) {
        setState({ loading: false, error: getApiErrorMessage(error, "Impossible de charger les sessions utilisateur."), sessions: [], usage: null });
      }
    };

    void load();
  }, [userId]);

  const toggleSession = (sessionId: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
        return next;
      }
      next.add(sessionId);
      return next;
    });

    if (!transcripts[sessionId] && !loadingRef.current.has(sessionId)) {
      loadingRef.current.add(sessionId);
      setTranscripts((prev) => ({ ...prev, [sessionId]: { loading: true, messages: [], error: "" } }));
      fetchAnalyticsSessionDetail(sessionId)
        .then((data) => {
          setTranscripts((prev) => ({ ...prev, [sessionId]: { loading: false, messages: data.messages ?? [], error: "" } }));
        })
        .catch((err) => {
          setTranscripts((prev) => ({ ...prev, [sessionId]: { loading: false, messages: [], error: getApiErrorMessage(err, "Impossible de charger le transcript.") } }));
        })
        .finally(() => {
          loadingRef.current.delete(sessionId);
        });
    }
  };

  if (state.loading) {
    return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <div className="h-28 animate-pulse rounded-3xl bg-card/60" key={item} />)}</div>;
  }

  if (state.error) {
    return (
      <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-5 text-amber-900 dark:text-amber-200">
        <p className="text-xs font-semibold uppercase tracking-[0.18em]">Attention</p>
        <p className="mt-2 text-sm leading-6">{state.error}</p>
      </div>
    );
  }

  const sessions = state.sessions;
  const usage = state.usage;
  const quota = usage?.quota;
  const totals = usage?.totals;
  const history = usage?.history ?? [];
  const recentBlocks = usage?.recent_blocks ?? [];
  const totalMessages = totals?.messages ?? sessions.reduce((acc, session) => acc + (session.message_count ?? 0), 0);
  const totalResponses = totals?.responses ?? sessions.reduce((acc, session) => acc + (session.response_count ?? 0), 0);
  const totalFallbacks = totals?.fallback_count ?? sessions.reduce((acc, session) => acc + (session.fallback_count ?? 0), 0);
  const totalErrors = totals?.errors_count ?? sessions.reduce((acc, session) => acc + (session.error_count ?? 0), 0);
  const totalDuration = totals?.total_duration_seconds ?? sessions.reduce((acc, session) => acc + (session.duration_seconds ?? 0), 0);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border/70 bg-background/80 p-5 md:p-6">
        <h2 className="text-lg font-semibold text-foreground">Indicateurs utilisateur</h2>
        <p className="mt-1 text-sm text-muted-foreground">Utilisateur : {userId}</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SmallStat icon={MessageCircleIcon} label="Sessions" value={metric(totals?.total_sessions ?? sessions.length)} />
          <SmallStat icon={MessageSquareIcon} label="Messages" value={metric(totalMessages)} />
          <SmallStat icon={Clock3Icon} label="Duree cumulee" value={formatDuration(totalDuration)} />
          <SmallStat icon={BanIcon} label="Blocages quota" value={metric(totals?.blocked_count ?? recentBlocks.length)} />
        </div>

        <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
          <StatCard label="Reponses" value={metric(totalResponses)} />
          <StatCard label="Fallback" value={metric(totalFallbacks)} />
          <StatCard label="Erreurs" value={metric(totalErrors)} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <section className="rounded-3xl border border-border/70 bg-background/80 p-5 md:p-6">
          <h2 className="text-lg font-semibold text-foreground">Quotas appliques</h2>
          <p className="mt-1 text-sm text-muted-foreground">Ce que cet utilisateur a deja consomme et ce qu'il lui reste.</p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <QuotaCard label="Reponses / heure" used={quota?.responses_per_hour.used ?? 0} limit={quota?.responses_per_hour.limit ?? 0} remaining={quota?.responses_per_hour.remaining ?? 0} />
            <QuotaCard label="Reponses / jour" used={quota?.responses_per_day.used ?? 0} limit={quota?.responses_per_day.limit ?? 0} remaining={quota?.responses_per_day.remaining ?? 0} />
            <QuotaCard label="Temps vocal / jour" used={quota?.voice_seconds_per_day.used ?? 0} limit={quota?.voice_seconds_per_day.limit ?? 0} remaining={quota?.voice_seconds_per_day.remaining ?? 0} suffix="s" />
            <QuotaCard label="Sessions paralleles" used={quota?.concurrency.user_active ?? 0} limit={quota?.concurrency.user_limit ?? 0} remaining={Math.max((quota?.concurrency.user_limit ?? 0) - (quota?.concurrency.user_active ?? 0), 0)} />
          </div>

          <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
            <StatCard label="Sessions globales actives" value={`${metric(quota?.concurrency.global_active)} / ${metric(quota?.concurrency.global_limit)}`} />
            <StatCard label="Blocages aujourd'hui" value={metric(quota?.blocked_today)} />
          </div>
        </section>

        <section className="rounded-3xl border border-border/70 bg-background/80 p-5 md:p-6">
          <h2 className="text-lg font-semibold text-foreground">Refus recents</h2>
          <p className="mt-1 text-sm text-muted-foreground">Historique exploitable des depassements de quota.</p>

          {recentBlocks.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Aucun refus recent pour cet utilisateur.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {recentBlocks.map((block: AnalyticsQuotaBlock) => (
                <div className="rounded-2xl border border-border bg-card/50 p-4" key={block.id}>
                  <p className="text-sm font-medium text-foreground">{quotaReasonLabel(block.reason)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(block.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-3xl border border-border/70 bg-background/80 p-5 md:p-6">
        <h2 className="text-lg font-semibold text-foreground">Historique recent</h2>
        <p className="mt-1 text-sm text-muted-foreground">Evolution simple de l'usage pour analyse metier.</p>
        <div className="mt-4 grid gap-2 md:grid-cols-7">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun historique recent.</p>
          ) : (
            history.map((item: AnalyticsHistoryPoint) => (
              <div className="rounded-2xl border border-border bg-card/50 px-3 py-3 text-xs text-muted-foreground" key={item.bucket}>
                <p className="font-medium text-foreground">{item.label}</p>
                <p className="mt-1">{item.responses} reponses</p>
                <p>{item.sessions} sessions</p>
                <p>{item.blocked_count} blocage(s)</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Sessions trouvees</h2>
        <p className="text-sm text-muted-foreground">Cliquez sur une session pour ouvrir le transcript.</p>

        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune session liee a cet utilisateur.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const isExpanded = expandedSessions.has(session.session_id);
              const transcript = transcripts[session.session_id];
              return (
                <div
                  className="rounded-3xl border border-border bg-background/80 transition-colors"
                  key={session.session_id}
                >
                  <button
                    className="w-full p-4 text-left"
                    onClick={() => toggleSession(session.session_id)}
                    type="button"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Session {session.session_id}</p>
                        <p className="text-xs text-muted-foreground">
                          Demarree {formatDate(session.started_at)} · canal {session.channel || "-"} · mode {session.mode || "-"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                          {session.status}
                        </span>
                        {isExpanded ? (
                          <ChevronUpIcon className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronDownIcon className="size-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                      <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2 text-xs text-muted-foreground">
                        <span className="text-foreground">Duree :</span> {formatDuration(session.duration_seconds)}
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2 text-xs text-muted-foreground">
                        <span className="text-foreground">Messages :</span> {metric(session.message_count)} · reponses {metric(session.response_count)}
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2 text-xs text-muted-foreground">
                        <span className="text-foreground">Fallback :</span> {metric(session.fallback_count)} · erreurs {metric(session.error_count)}
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2 text-xs text-muted-foreground">
                        <span className="text-foreground">Review :</span> {session.needs_review ? "oui" : "non"}
                      </div>
                    </div>

                    {session.review_reason ? (
                      <p className="mt-2 flex items-start gap-2 text-xs text-amber-600">
                        <ShieldAlertIcon className="mt-0.5 size-3.5" />
                        <span>{session.review_reason}</span>
                      </p>
                    ) : null}
                  </button>

                  {isExpanded ? (
                    <div className="border-t border-border/70 px-4 pb-4 pt-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Echanges</p>
                        <Link
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:bg-foreground hover:text-background"
                          href={`/admin/analytics/sessions/${encodeURIComponent(session.session_id)}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Voir detail complet
                        </Link>
                      </div>

                      {transcript?.loading ? (
                        <div className="space-y-2">
                          <div className="h-12 animate-pulse rounded-2xl bg-card/60" />
                          <div className="h-12 animate-pulse rounded-2xl bg-card/60" />
                        </div>
                      ) : transcript?.error ? (
                        <p className="text-xs text-amber-600">{transcript.error}</p>
                      ) : transcript?.messages.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Aucun message stocke pour cette session.</p>
                      ) : (
                        <div className="space-y-2">
                          {(transcript?.messages ?? [])
                            .filter((m) => m.role === "user" || m.role === "assistant")
                            .map((message) => (
                              <div
                                className={`rounded-2xl border px-3 py-2 text-sm ${
                                  message.role === "user"
                                    ? "border-blue-500/20 bg-blue-500/5"
                                    : "border-emerald-500/20 bg-emerald-500/5"
                                }`}
                                key={message.id}
                              >
                                <p className={`mb-1 text-xs font-medium ${message.role === "user" ? "text-blue-600 dark:text-blue-300" : "text-emerald-600 dark:text-emerald-300"}`}>
                                  {message.role === "user" ? "Utilisateur" : "Agent"}
                                </p>
                                <p className="whitespace-pre-wrap wrap-break-word text-foreground">{message.content}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{formatDate(message.created_at)}</p>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SmallStat({ icon: Icon, label, value }: { icon: typeof Clock3Icon; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3">
      <div className="inline-flex items-center rounded-full border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
        <Icon className="mr-2 size-3.5" />
        {label}
      </div>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-foreground">{value}</p>
    </div>
  );
}

function QuotaCard({
  label,
  used,
  limit,
  remaining,
  suffix = "",
}: {
  label: string;
  used: number;
  limit: number;
  remaining: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">
        {used}
        {suffix} / {limit}
        {suffix}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Reste {remaining}{suffix}</p>
    </div>
  );
}
