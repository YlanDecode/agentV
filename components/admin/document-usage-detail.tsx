"use client";

import Link from "next/link";
import { ArrowRightIcon, BookOpenIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchAnalyticsDocumentUsage, type AnalyticsDocumentUsagePayload } from "@/lib/agentvocal-admin-api";
import { getApiErrorMessage } from "@/lib/axios";

function buildSessionInspectorHref(sessionId: string) {
  return `/admin/analytics/user-sessions?user_id=${encodeURIComponent(`session:${sessionId}`)}&session_id=${encodeURIComponent(sessionId)}`;
}

type LoadState = {
  loading: boolean;
  error: string;
  data: AnalyticsDocumentUsagePayload | null;
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

export function DocumentUsageDetail({ documentId }: { documentId: number }) {
  const [state, setState] = useState<LoadState>({ loading: true, error: "", data: null });

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchAnalyticsDocumentUsage(documentId);
        setState({ loading: false, error: "", data });
      } catch (error) {
        setState({ loading: false, error: getApiErrorMessage(error, "Impossible de charger l'usage de ce document."), data: null });
      }
    };

    if (Number.isFinite(documentId) && documentId > 0) {
      void load();
    } else {
      setState({ loading: false, error: "Document invalide.", data: null });
    }
  }, [documentId]);

  if (state.loading) {
    return <div className="h-40 animate-pulse rounded-3xl bg-card/60" />;
  }

  if (state.error) {
    return <p className="text-sm text-muted-foreground">{state.error}</p>;
  }

  const document = state.data?.document;
  const usages = state.data?.usages ?? [];
  if (!document) {
    return <p className="text-sm text-muted-foreground">Document introuvable.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/70 bg-card/50 p-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
          <BookOpenIcon className="size-3.5" />
          Document RAG
        </div>
        <h2 className="mt-3 text-lg font-semibold text-foreground">{document.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">Format {document.source_format} · {usages.length} occurrence(s) d&apos;usage remontée(s)</p>
      </div>

      {usages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun extrait utilisé n&apos;a été remonté pour ce document.</p>
      ) : (
        <div className="space-y-4">
          {usages.map((usage, index) => (
            <article className="rounded-3xl border border-border bg-card/50 p-5" key={`${usage.session_id}-${usage.created_at}-${index}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                    <SearchIcon className="size-3.5" />
                    {usage.used_in_final_answer ? "utilise dans la reponse" : "source candidate"}
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">{usage.query || "Question non remontee"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(usage.created_at)}{usage.chunk_index !== null && usage.chunk_index !== undefined ? ` · chunk ${usage.chunk_index + 1}` : ""}</p>
                </div>
                {usage.session_id ? (
                  <Link className="inline-flex items-center gap-2 text-xs font-medium text-foreground underline underline-offset-2" href={buildSessionInspectorHref(usage.session_id)}>
                    Voir la session
                    <ArrowRightIcon className="size-3.5" />
                  </Link>
                ) : null}
              </div>
              <div className="mt-4 rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{usage.excerpt || "Extrait indisponible."}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
