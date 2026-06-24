import Link from "next/link";
import { ArrowLeftIcon, BookOpenIcon } from "lucide-react";
import { DocumentUsageDetail } from "@/components/admin/document-usage-detail";

type DocumentDetailPageProps = {
  params: Promise<{ documentId: string }> | { documentId: string };
};

export default async function DocumentDetailPage({ params }: DocumentDetailPageProps) {
  const resolvedParams = await params;
  const documentId = Number.parseInt((resolvedParams.documentId || "").trim(), 10);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border/70 bg-card/70 p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-xs text-muted-foreground">
              <BookOpenIcon className="size-3.5" />
              Usage RAG detaille
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Document utilise par l&apos;agent</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground md:text-base">Consultez les extraits effectivement mobilises dans les reponses et ouvrez les sessions associees.</p>
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
        <DocumentUsageDetail documentId={documentId} />
      </section>
    </div>
  );
}
