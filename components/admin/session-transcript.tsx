"use client";

import Link from "next/link";
import { AlertTriangleIcon, ArrowLeftIcon, Clock3Icon, MessageCircleIcon, MessageSquareIcon, ShieldAlertIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchAnalyticsSessionDetail, type AnalyticsSessionDetailPayload } from "@/lib/agentvocal-admin-api";
import { getApiErrorMessage } from "@/lib/axios";

type LoadState = {
  loading: boolean;
  error: string;
  data: AnalyticsSessionDetailPayload | null;
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

function roleStyle(role: string) {
  switch (role) {
    case "assistant":
      return {
        badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 border-emerald-500/25",
        label: "Assistant",
      };
    case "user":
      return {
        badge: "bg-blue-500/10 text-blue-700 dark:text-blue-200 border-blue-500/25",
        label: "Utilisateur",
      };
    case "system":
      return {
        badge: "bg-violet-500/10 text-violet-700 dark:text-violet-200 border-violet-500/25",
        label: "Système",
      };
    case "tool":
      return {
        badge: "bg-amber-500/10 text-amber-700 dark:text-amber-200 border-amber-500/25",
        label: "Outil",
      };
    default:
      return {
        badge: "bg-muted text-muted-foreground border-border",
        label: role,
      };
  }
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

  if (state.loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-3xl bg-card/60" />
        <div className="h-64 animate-pulse rounded-3xl bg-card/60" />
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

  const session = state.data?.session;
  const messages = state.data?.messages ?? [];
  const issues = useMemo(() => state.data?.issues ?? [], [state.data?.issues]);

  if (!session) {
    return <p className="text-sm text-muted-foreground">Session introuvable.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <section className="rounded-3xl border border-border/70 bg-background/80 p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
                    <MessageSquareIcon className="size-3.5" />
                Détail de la session
              </div>
              <h2 className="mt-2 text-lg font-semibold text-foreground">{session.session_id}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Utilisateur : {session.user_id || "Anonyme"} · statut {session.status} · canal {session.channel}
              </p>
            </div>
            <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">{session.mode}</span>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Début" value={formatDate(session.started_at)} />
            <Stat label="Fin" value={session.ended_at ? formatDate(session.ended_at) : "En cours / finalisée"} />
            <Stat label="Durée" value={formatDuration(session.duration_seconds)} />
            <Stat label="Messages" value={String(session.message_count)} />
            <Stat label="Réponses" value={String(session.response_count)} />
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
                Incidents remontés
              </div>
              <h3 className="mt-2 text-base font-semibold text-foreground">Problèmes détectés</h3>
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
      </div>

      <section className="rounded-3xl border border-border/70 bg-background/80 p-5 md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-foreground">Transcript</h3>
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

        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun message n'est encore stocké pour cette session.</p>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => {
              const style = roleStyle(message.role);
              return (
                <article className="rounded-2xl border border-border bg-card/60 p-4" key={message.id}>
                  <div className={`inline-flex items-center gap-2 rounded-full border ${style.badge} px-2.5 py-1 text-xs`}>
                    <MessageCircleIcon className="size-3.5" />
                    <span className="font-medium">{style.label}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">{message.content}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatDate(message.created_at)}
                    {message.message_id ? ` · ${message.message_id}` : ""}
                    {message.feedback_rating ? ` · feedback: ${message.feedback_rating}` : ""}
                    {message.is_flagged ? " · signalé" : ""}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
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
