"use client";

import { useEffect, useState } from "react";

type PersonaForm = {
  id?: number;
  name: string;
  role: string;
  languageStyle: string;
  typicalResponseLength: string;
  tone: string;
  recurringExpressions: string;
  forbiddenPhrases: string;
  cloneSystemPrompt: string;
  cloneVoiceSystemPrompt: string;
  groqChatModel: string;
  groqTranscriptionModel: string;
  ttsProvider: string;
  fishReferenceId: string;
  fishTtsModel: string;
  fishTtsLatency: string;
  elevenLabsVoiceId: string;
  elevenLabsModelId: string;
};

const SERIOUS_TEXT_PROMPT =
  "Tu es un assistant francophone naturel, clair, utile et sobre. Réponds avec précision. N'utilise ni humour, ni ironie, ni style théâtral. Ne brode jamais. Si une information manque, dis-le clairement.";

const SERIOUS_VOICE_PROMPT =
  "Tu réponds pour une synthèse vocale temps réel. Parle comme un humain au téléphone: phrases naturelles, courtes à moyennes, fluides, une idée par phrase, sans liste. Reste sobre, professionnel, rassurant, sans humour, sans blague, sans familiarité excessive.";

const emptyPersona: PersonaForm = {
  name: "",
  role: "",
  languageStyle: "",
  typicalResponseLength: "",
  tone: "",
  recurringExpressions: "",
  forbiddenPhrases: "",
  cloneSystemPrompt: "",
  cloneVoiceSystemPrompt: "",
  groqChatModel: "",
  groqTranscriptionModel: "",
  ttsProvider: "auto",
  fishReferenceId: "",
  fishTtsModel: "s2-pro",
  fishTtsLatency: "balanced",
  elevenLabsVoiceId: "",
  elevenLabsModelId: "",
};

export default function PersonaPage() {
  const [persona, setPersona] = useState<PersonaForm>(emptyPersona);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/settings/clone", { cache: "no-store" });
      if (!response.ok) {
        setStatus("Impossible de charger la configuration.");
        setLoading(false);
        return;
      }
      const payload = await response.json() as { persona: PersonaForm };
      setPersona(payload.persona);
      setLoading(false);
    };
    void load();
  }, []);

  const update = (key: keyof PersonaForm, value: string) =>
    setPersona((c) => ({ ...c, [key]: value }));

  const save = async () => {
    setSaving(true);
    setStatus("");
    const response = await fetch("/api/settings/clone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona }),
    });
    if (!response.ok) {
      setStatus("Echec de la sauvegarde.");
      setSaving(false);
      return;
    }
    const payload = await response.json() as { persona: PersonaForm };
    setPersona(payload.persona);
    setSaving(false);
    setStatus("Configuration sauvegardée.");
  };

  const applySeriousPrompts = () => {
    setPersona((c) => ({
      ...c,
      cloneSystemPrompt: SERIOUS_TEXT_PROMPT,
      cloneVoiceSystemPrompt: SERIOUS_VOICE_PROMPT,
    }));
    setStatus("Preset sobre appliqué. Sauvegardez pour l'activer.");
  };

  if (loading) {
    return <PageShell title="Persona & Prompts"><p className="text-sm text-muted-foreground">Chargement...</p></PageShell>;
  }

  return (
    <PageShell
      title="Persona & Prompts"
      subtitle="Comportement, ton et configuration des modèles"
      action={
        <div className="flex items-center gap-3">
          {status && <p className="text-sm text-muted-foreground">{status}</p>}
          <button
            className="rounded-xl bg-foreground px-4 py-2 text-sm text-background hover:opacity-90 disabled:opacity-50"
            disabled={saving}
            onClick={() => void save()}
            type="button"
          >
            {saving ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <Section title="Persona Live">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nom" value={persona.name} onChange={(v) => update("name", v)} />
            <Field label="Rôle" value={persona.role} onChange={(v) => update("role", v)} />
            <Field label="Ton" value={persona.tone} onChange={(v) => update("tone", v)} />
            <Field label="Longueur type" value={persona.typicalResponseLength} onChange={(v) => update("typicalResponseLength", v)} />
          </div>
          <Field label="Style de langage" value={persona.languageStyle} onChange={(v) => update("languageStyle", v)} />
          <Field label="Expressions récurrentes" value={persona.recurringExpressions} onChange={(v) => update("recurringExpressions", v)} />
          <Field label="Phrases interdites" value={persona.forbiddenPhrases} onChange={(v) => update("forbiddenPhrases", v)} />
        </Section>

        <Section title="Prompts">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-xl border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
              onClick={applySeriousPrompts}
              type="button"
            >
              Appliquer un preset sobre
            </button>
            <p className="text-xs text-muted-foreground">
              Utile si Groq répond avec un ton trop léger ou comique.
            </p>
          </div>
          <Field label="Prompt texte" multiline value={persona.cloneSystemPrompt} onChange={(v) => update("cloneSystemPrompt", v)} />
          <Field label="Prompt vocal" multiline value={persona.cloneVoiceSystemPrompt} onChange={(v) => update("cloneVoiceSystemPrompt", v)} />
        </Section>

        <Section title="Model Stack">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Groq chat model" value={persona.groqChatModel} onChange={(v) => update("groqChatModel", v)} />
            <Field label="Groq transcription model" value={persona.groqTranscriptionModel} onChange={(v) => update("groqTranscriptionModel", v)} />
            <Field label="ElevenLabs voice ID (legacy)" value={persona.elevenLabsVoiceId} onChange={(v) => update("elevenLabsVoiceId", v)} />
            <Field label="ElevenLabs model ID (legacy)" value={persona.elevenLabsModelId} onChange={(v) => update("elevenLabsModelId", v)} />
          </div>
        </Section>

        <Section title="TTS Runtime">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="TTS provider" value={persona.ttsProvider} onChange={(v) => update("ttsProvider", v)} />
            <Field label="Fish reference ID par défaut" value={persona.fishReferenceId} onChange={(v) => update("fishReferenceId", v)} />
            <Field label="Fish model" value={persona.fishTtsModel} onChange={(v) => update("fishTtsModel", v)} />
            <Field label="Fish latency" value={persona.fishTtsLatency} onChange={(v) => update("fishTtsLatency", v)} />
          </div>
        </Section>
      </div>
    </PageShell>
  );
}

// ---- Shared layout components ----

function PageShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card/70 p-4 md:p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea
          className="min-h-28 rounded-xl border border-border bg-background px-3 py-2 text-sm"
          onChange={(e) => onChange(e.target.value)}
          value={value}
        />
      ) : (
        <input
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          onChange={(e) => onChange(e.target.value)}
          value={value}
        />
      )}
    </label>
  );
}
