import { VoiceRecorder } from "@/components/voice/voice-recorder";

export default function VoicesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-xl font-semibold">Voix clonées</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Enregistrez ou importez des échantillons vocaux pour le clonage F5-TTS / Fish Audio.
          Le bouton bouclier permet de gérer le consentement par voix.
        </p>
      </div>
      <section className="rounded-2xl border border-border bg-card/70 p-4 md:p-5">
        <VoiceRecorder />
      </section>
    </div>
  );
}
