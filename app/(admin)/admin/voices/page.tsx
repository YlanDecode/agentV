import { VoiceRecorder } from "@/components/voice/voice-recorder";

export default function VoicesPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border/70 bg-card/70 p-6 shadow-sm md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Bibliothèque vocale
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Ajoutez une voix sans vous perdre dans les actions.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              La logique a été simplifiée en un parcours clair : capturer ou importer,
              nommer, sauvegarder, puis contrôler le consentement dans la bibliothèque.
            </p>
          </div>

          <div className="grid gap-3 rounded-2xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">Durée recommandée</p>
              <p className="mt-1">20 à 30 secondes de voix naturelle.</p>
            </div>
            <div>
              <p className="font-medium text-foreground">Consentement</p>
              <p className="mt-1">Le bouclier dans la bibliothèque sert à accorder ou révoquer le consentement.</p>
            </div>
            <div>
              <p className="font-medium text-foreground">Objectif</p>
              <p className="mt-1">Conserver peu de voix, mais propres, identifiées et maintenables.</p>
            </div>
          </div>
        </div>
      </section>

      <VoiceRecorder />
    </div>
  );
}
