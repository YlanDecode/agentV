"use client";

import Link from "next/link";
import { Clock3Icon, MessageCircleIcon, MessageSquareIcon, ShieldAlertIcon, UserRoundIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchAnalyticsUserSessions, type AnalyticsUserSessionItem } from "@/lib/agentvocal-admin-api";
import { getApiErrorMessage } from "@/lib/axios";

type LoadState = {
  loading: boolean;
  error: string;
  data: { user_id: string; sessions: AnalyticsUserSessionItem[] } | null;
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

export function UserSessionsDashboard({ userId }: { userId: string }) {
  const [state, setState] = useState<LoadState>({
    loading: true,
    error: "",
    data: null,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchAnalyticsUserSessions(userId);
        setState({ loading: false, error: "", data });
      } catch (error) {
        setState({ loading: false, error: getApiErrorMessage(error, "Impossible de charger les sessions utilisateur."), data: null });
      }
    };

    void load();
  }, [userId]);

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

  const sessions = state.data?.sessions ?? [];
  const totalMessages = sessions.reduce((acc, session) => acc + (session.message_count ?? 0), 0);
  const totalResponses = sessions.reduce((acc, session) => acc + (session.response_count ?? 0), 0);
  const totalFallbacks = sessions.reduce((acc, session) => acc + (session.fallback_count ?? 0), 0);
  const totalErrors = sessions.reduce((acc, session) => acc + (session.error_count ?? 0), 0);
  const totalDuration = sessions.reduce((acc, session) => acc + (session.duration_seconds ?? 0), 0);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border/70 bg-background/80 p-5 md:p-6">
        <h2 className="text-lg font-semibold text-foreground">Indicateurs utilisateur</h2>
        <p className="mt-1 text-sm text-muted-foreground">Utilisateur : {userId}</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SmallStat icon={MessageCircleIcon} label="Sessions" value={metric(sessions.length)} />
          <SmallStat icon={MessageSquareIcon} label="Messages" value={metric(totalMessages)} />
          <SmallStat icon={Clock3Icon} label="Durée cumulée" value={formatDuration(totalDuration)} />
          <SmallStat icon={UserRoundIcon} label="Fallback" value={metric(totalFallbacks)} />
        </div>

        <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-card/50 p-3">
            <p className="text-xs text-muted-foreground">Réponses</p>
            <p className="mt-1 font-medium text-foreground">{metric(totalResponses)}</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/50 p-3">
            <p className="text-xs text-muted-foreground">Erreurs</p>
            <p className="mt-1 font-medium text-foreground">{metric(totalErrors)}</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Sessions trouvées</h2>
        <p className="text-sm text-muted-foreground">Cliquez sur une session pour ouvrir le transcript.</p>

        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune session liée à cet utilisateur.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <Link
                className="group block rounded-3xl border border-border bg-background/80 p-4 transition-colors hover:border-foreground/30 hover:bg-card"
                href={`/admin/analytics/sessions/${encodeURIComponent(session.session_id)}`}
                key={session.session_id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Session {session.session_id}</p>
                    <p className="text-xs text-muted-foreground">
                      Démarrée {formatDate(session.started_at)} · canal {session.channel || "-"} · mode {session.mode || "-"}
                    </p>
                  </div>
                  <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                    {session.status}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                  <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2 text-xs text-muted-foreground">
                    <span className="text-foreground">Durée :</span> {formatDuration(session.duration_seconds)}
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2 text-xs text-muted-foreground">
                    <span className="text-foreground">Messages :</span> {metric(session.message_count)} · réponses {metric(session.response_count)}
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
                    <ShieldAlertIcon className="size-3.5 mt-0.5" />
                    <span>{session.review_reason}</span>
                  </p>
                ) : null}
              </Link>
            ))}
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
