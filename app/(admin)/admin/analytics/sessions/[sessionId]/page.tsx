import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeftIcon, MessageCircleIcon } from "lucide-react";
import { SessionTranscript } from "@/components/admin/session-transcript";

type SessionDetailPageProps = {
  params: Promise<{
    sessionId: string;
  }>;
};

async function SessionDetailContent({ params }: SessionDetailPageProps) {
  const resolvedParams = await params;
  const sessionId = decodeURIComponent((resolvedParams.sessionId || "").trim());

  return (
    <>
      <section className="rounded-3xl border border-border/70 bg-card/70 p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-xs text-muted-foreground">
              <MessageCircleIcon className="size-3.5" />
              Transcript de session
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Détail de conversation</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground md:text-base">
                Session : <span className="font-semibold">{sessionId || "inconnue"}</span>
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

      <section className="rounded-3xl border border-border/70 bg-background/80 p-4 md:p-6">
        <SessionTranscript sessionId={sessionId} />
      </section>
    </>
  );
}

export default function SessionDetailPage({ params }: SessionDetailPageProps) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<div className="h-28 animate-pulse rounded-3xl bg-card/60" />}>
        <SessionDetailContent params={params} />
      </Suspense>
    </div>
  );
}
