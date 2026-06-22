"use client";

import Link from "next/link";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  BotIcon,
  Clock3Icon,
  MessageCircleIcon,
  MicIcon,
  ShieldAlertIcon,
  UserRoundIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  fetchAnalyticsSessionDetail,
  type AnalyticsSessionDetailPayload,
  type AnalyticsSessionEvent,
  type AnalyticsSessionMessage,
} from "@/lib/agentvocal-admin-api";
import { getApiErrorMessage } from "@/lib/axios";

type LoadState = {
  loading: boolean;
  error: string;
  data: AnalyticsSessionDetailPayload | null;
};

type SessionTurn = {
  key: string;
  index: number;
  userMessage?: AnalyticsSessionMessage;
  assistantMessage?: AnalyticsSessionMessage;
  userEvent?: AnalyticsSessionEvent;
  assistantEvent?: AnalyticsSessionEvent;
  responseDelayMs: number | null;
  executionMs: number | null;
  hasFallback: boolean;
  hasError: boolean;
  hasRag: boolean;
};

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

function formatMs(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }
  return `${(value / 1000).toFixed(2)} s`;
}

function diffMs(from?: string | null, to?: string | null) {
  if (!from || !to) {
    return null;
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return null;
  }
  return Math.max(0, toDate.getTime() - fromDate.getTime());
}

function bubbleTone(role: string) {
  switch (role) {
    case "assistant":
      return "border-emerald-500/20 bg-emerald-500/10";
    case "user":
      return "border-sky-500/20 bg-sky-500/10";
    default:
      return "border-border bg-card/70";
  }
}

function turnBadges(turn: SessionTurn, mode: string) {
  const badges = [mode === "voice" ? "vocal" : "texte"];
  if (turn.hasRag) {
    badges.push("RAG");
  }
  if (turn.hasFallback) {
    badges.push("fallback");
  }
  if (turn.hasError) {
    badges.push("erreur");
  }
  return badges;
}

function buildTurns(messages: AnalyticsSessionMessage[], events: AnalyticsSessionEvent[]) {
  const userEvents = events.filter((event) => event.event_type === "user_message_received");
  const assistantEvents = events.filter((event) => event.event_type === "assistant_response_completed");

  const turns: SessionTurn[] = [];
  let activeTurn: SessionTurn | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      activeTurn = {
        key: `turn-${message.id}`,
        index: turns.length + 1,
        userMessage: message,
        responseDelayMs: null,
        executionMs: null,
        hasFallback: false,
        hasError: false,
        hasRag: false,
      };
      turns.push(activeTurn);
      continue;
    }

    if (message.role === "assistant") {
      if (!activeTurn || activeTurn.assistantMessage) {
        activeTurn = {
          key: `turn-assistant-${message.id}`,
          index: turns.length + 1,
          assistantMessage: message,
          responseDelayMs: null,
          executionMs: null,
          hasFallback: false,
          hasError: false,
          hasRag: false,
        };
        turns.push(activeTurn);
      } else {
        activeTurn.assistantMessage = message;
      }
      continue;
    }

    if (!activeTurn) {
      activeTurn = {
        key: `turn-meta-${message.id}`,
        index: turns.length + 1,
        responseDelayMs: null,
        executionMs: null,
        hasFallback: false,
        hasError: false,
        hasRag: false,
      };
      turns.push(activeTurn);
    }
  }

  turns.forEach((turn, index) => {
    turn.userEvent = userEvents[index];
    turn.assistantEvent = assistantEvents[index];
    turn.responseDelayMs = turn.userEvent && turn.assistantEvent
      ? diffMs(turn.userEvent.ts, turn.assistantEvent.ts)
      : diffMs(turn.userMessage?.created_at, turn.assistantMessage?.created_at);
    turn.executionMs = turn.assistantEvent?.duration_ms ?? turn.responseDelayMs;
    const assistantText = turn.assistantMessage?.content.toLowerCase() ?? "";
    turn.hasFallback = assistantText.includes("je ne sais pas") || assistantText.includes("je n'ai pas") || assistantText.includes("je n’ai pas");
    turn.hasError = events.some((event) => event.event_type === "assistant_response_failed");
    turn.hasRag = Boolean(turn.assistantEvent?.metadata?.rag_query);
  });

  return turns;
}

function averageMs(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (filtered.length === 0) {
    return null;
  }
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

export function SessionTranscript({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<LoadState>({
    loading: true,
    error: "",
    data: null,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchAnalyticsSessionDetail(sessionId);
        setState({ loading: false, error: "", data });
      } catch (error) {
        setState({ loading: false, error: getApiErrorMessage(error, "Impossible de charger la session."), data: null });
      }
    };

    void load();
  }, [sessionId]);

  const session = state.data?.session;
  const messages = state.data?.messages ?? [];
  const issues = state.data?.issues ?? [];
  const events = state.data?.events ?? [];

  const turns = useMemo(() => buildTurns(messages, events), [messages, events]);
  const averageResponseMs = useMemo(() => averageMs(turns.map((turn) => turn.responseDelayMs)), [turns]);
  const averageExecutionMs = useMemo(() => averageMs(turns.map((turn) => turn.executionMs)), [turns]);

  if (state.loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="h-[640px] animate-pulse rounded-3xl bg-card/60" />
        <div className="h-[640px] animate-pulse rounded-3xl bg-card/60" />
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

  if (!session) {
    return <p className="text-sm text-muted-foreground">Session introuvable.</p>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-3xl border border-border/70 bg-background/80 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              <MessageCircleIcon className="size-3.5" />
              Interface session
            </div>
            <h2 className="mt-3 text-lg font-semibold text-foreground">{session.session_id}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {session.user_id || "Anonyme"} · {session.channel} · {session.mode}
            </p>
          </div>

          {session.user_id ? (
            <Link
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:bg-foreground hover:text-background"
              href={`/admin/analytics/user-sessions?user_id=${encodeURIComponent(session.user_id)}`}
            >
              <ArrowLeftIcon className="size-3.5" />
              Voir toutes ses sessions
            </Link>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricStat label="Temps moyen de reponse" value={formatMs(averageResponseMs)} />
          <MetricStat label="Temps moyen d'execution" value={formatMs(averageExecutionMs)} />
          <MetricStat label="Duree totale" value={formatDuration(session.duration_seconds)} />
          <MetricStat label="Tours detectes" value={String(turns.length)} />
        </div>

        <div className="mt-4 rounded-[28px] border border-border bg-card/20 p-3 md:p-4">
          {turns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun échange stocké pour cette session.</p>
          ) : (
            <div className="max-h-[72vh] space-y-6 overflow-y-auto pr-1">
              {turns.map((turn) => (
                <article className="rounded-[28px] border border-border/70 bg-background/70 p-4 shadow-sm" key={turn.key}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Tour {turn.index}
                      </div>
                      {turnBadges(turn, session.mode).map((badge) => (
                        <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground" key={`${turn.key}-${badge}`}>
                          {badge}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <TinyStat icon={Clock3Icon} label="Reponse" value={formatMs(turn.responseDelayMs)} />
                      <TinyStat icon={BotIcon} label="Execution" value={formatMs(turn.executionMs)} />
                    </div>
                  </div>

                  {turn.userMessage ? (
                    <div className="mt-4 flex justify-end">
                      <div className={`max-w-[85%] rounded-[28px] border px-4 py-3 shadow-sm ${bubbleTone("user")}`}>
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <span className="flex size-7 items-center justify-center rounded-full bg-sky-500/15 text-sky-300">
                            <UserRoundIcon className="size-3.5" />
                          </span>
                          Utilisateur · {formatDate(turn.userMessage.created_at)}
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{turn.userMessage.content}</p>
                      </div>
                    </div>
                  ) : null}

                  {turn.assistantMessage ? (
                    <div className="mt-4 flex justify-start">
                      <div className={`max-w-[85%] rounded-[28px] border px-4 py-3 shadow-sm ${bubbleTone("assistant")}`}>
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <span className="flex size-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
                            {session.mode === "voice" ? <MicIcon className="size-3.5" /> : <BotIcon className="size-3.5" />}
                          </span>
                          Assistant · {formatDate(turn.assistantMessage.created_at)}
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{turn.assistantMessage.content}</p>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {turn.assistantMessage.feedback_rating ? <span>Feedback: {turn.assistantMessage.feedback_rating}</span> : null}
                          {turn.assistantMessage.is_flagged ? <span>Message signalé</span> : null}
                          {turn.assistantEvent?.metadata?.rag_query ? <span>RAG: {String(turn.assistantEvent.metadata.rag_query)}</span> : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <section className="rounded-3xl border border-border/70 bg-background/80 p-5 md:p-6">
          <h3 className="text-base font-semibold text-foreground">Synthese session</h3>
          <div className="mt-4 space-y-2">
            <Stat label="Debut" value={formatDate(session.started_at)} />
            <Stat label="Fin" value={session.ended_at ? formatDate(session.ended_at) : "En cours / recente"} />
            <Stat label="Statut" value={session.status} />
            <Stat label="Messages" value={String(session.message_count)} />
            <Stat label="Reponses" value={String(session.response_count)} />
            <Stat label="Fallback" value={String(session.fallback_count)} />
            <Stat label="Erreurs" value={String(session.error_count)} />
            <Stat label="A revoir" value={session.needs_review ? "Oui" : "Non"} />
          </div>

          {session.review_reason ? (
            <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-3 text-sm text-amber-900 dark:text-amber-200">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
                <ShieldAlertIcon className="size-3.5" />
                Raison review
              </p>
              <p className="mt-1 leading-6">{session.review_reason}</p>
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-border/70 bg-background/80 p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
                <AlertTriangleIcon className="size-3.5" />
                Incidents
              </div>
              <h3 className="mt-2 text-base font-semibold text-foreground">Points remontes</h3>
            </div>
            <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">{issues.length}</span>
          </div>

          {issues.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Aucun problème détecté pour cette session.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {issues.map((issue) => (
                <li className="rounded-2xl border border-border bg-card/50 p-3 text-sm" key={issue.id}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{issue.issue_type}</p>
                  <p className="mt-1 text-foreground">{issue.description}</p>
                  <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock3Icon className="size-3.5" />
                    {formatDate(issue.created_at)} · {issue.severity} · {issue.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function MetricStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function TinyStat({ icon: Icon, label, value }: { icon: typeof Clock3Icon; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1">
      <Icon className="size-3.5" />
      {label}: {value}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
