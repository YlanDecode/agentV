import { RagDocuments } from "@/components/rag/rag-documents";

export default function RagPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border/70 bg-card/70 p-6 shadow-sm md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Corpus documentaire
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Centralisez la connaissance utile à l&apos;agent.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              Ici, tout ce qui nourrit le RAG est regroupé dans une seule vue : import,
              édition, nettoyage et suppression. L&apos;objectif est d&apos;éviter la dispersion
              entre plusieurs menus et plusieurs bases concurrentes.
            </p>
          </div>

          <div className="grid gap-3 rounded-2xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">Formats acceptés</p>
              <p className="mt-1">TXT, Markdown et CSV.</p>
            </div>
            <div>
              <p className="font-medium text-foreground">Bon réflexe</p>
              <p className="mt-1">Commencez par un petit corpus propre avant d&apos;en ajouter plus.</p>
            </div>
            <div>
              <p className="font-medium text-foreground">Après import</p>
              <p className="mt-1">Relisez et corrigez directement les documents si le rendu n&apos;est pas assez net.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-border/70 bg-background/80 p-4 md:p-6">
        <RagDocuments />
      </section>
    </div>
  );
}
