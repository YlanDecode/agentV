"use client";

import Link from "next/link";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
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
  elevenLabsVoiceId: string;
  elevenLabsModelId: string;
};

type SettingsPayload = {
  persona: PersonaForm;
  knowledgeBase: Array<{
    id: number;
    categorie: string;
    question: string;
    reponse: string;
  }>;
  products: Array<{
    id: number;
    nom: string;
    description: string | null;
    prix_mensuel: number | null;
    prix_annuel: number | null;
    fonctionnalites: string | null;
  }>;
  examples: Array<{
    id: number;
    category: string;
    user_input: string;
    persona_response: string;
  }>;
};

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
  elevenLabsVoiceId: "",
  elevenLabsModelId: "",
};

export default function SettingsPage() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [persona, setPersona] = useState<PersonaForm>(emptyPersona);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/settings/clone", {
        cache: "no-store",
      });
      if (!response.ok) {
        setStatus("Impossible de charger la configuration POC.");
        setLoading(false);
        return;
      }

      const payload = (await response.json()) as SettingsPayload;
      setData(payload);
      setPersona(payload.persona);
      setLoading(false);
    };

    void load();
  }, []);

  const update = (key: keyof PersonaForm, value: string) => {
    setPersona((current) => ({ ...current, [key]: value }));
  };

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

    const payload = (await response.json()) as SettingsPayload;
    setData(payload);
    setPersona(payload.persona);
    setSaving(false);
    setStatus("Configuration POC sauvegardee dans Supabase.");
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 md:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 rounded-[28px] border border-border bg-background p-5 shadow-2xl md:p-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
              POC Control Room
            </p>
            <h1 className="text-2xl font-semibold">
              Configuration Persona et Contenu
            </h1>
          </div>
          <Link className="text-sm text-muted-foreground underline" href="/">
            Retour au chat
          </Link>
        </div>

        {loading || !data ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.95fr]">
            <div className="space-y-6">
              <Section title="Persona Live">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Nom"
                    value={persona.name}
                    onChange={(value) => update("name", value)}
                  />
                  <Field
                    label="Role"
                    value={persona.role}
                    onChange={(value) => update("role", value)}
                  />
                  <Field
                    label="Ton"
                    value={persona.tone}
                    onChange={(value) => update("tone", value)}
                  />
                  <Field
                    label="Longueur type"
                    value={persona.typicalResponseLength}
                    onChange={(value) => update("typicalResponseLength", value)}
                  />
                </div>
                <Field
                  label="Style de langage"
                  value={persona.languageStyle}
                  onChange={(value) => update("languageStyle", value)}
                />
                <Field
                  label="Expressions recurrentes"
                  value={persona.recurringExpressions}
                  onChange={(value) => update("recurringExpressions", value)}
                />
                <Field
                  label="Phrases interdites"
                  value={persona.forbiddenPhrases}
                  onChange={(value) => update("forbiddenPhrases", value)}
                />
              </Section>

              <Section title="Prompts">
                <Field
                  label="Prompt texte"
                  multiline
                  value={persona.cloneSystemPrompt}
                  onChange={(value) => update("cloneSystemPrompt", value)}
                />
                <Field
                  label="Prompt vocal"
                  multiline
                  value={persona.cloneVoiceSystemPrompt}
                  onChange={(value) => update("cloneVoiceSystemPrompt", value)}
                />
              </Section>

              <Section title="Model Stack">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Groq chat model"
                    value={persona.groqChatModel}
                    onChange={(value) => update("groqChatModel", value)}
                  />
                  <Field
                    label="Groq transcription model"
                    value={persona.groqTranscriptionModel}
                    onChange={(value) =>
                      update("groqTranscriptionModel", value)
                    }
                  />
                  <Field
                    label="Ancien voice ID ElevenLabs (ignore par Noiz)"
                    value={persona.elevenLabsVoiceId}
                    onChange={(value) => update("elevenLabsVoiceId", value)}
                  />
                  <Field
                    label="Ancien model ID ElevenLabs (ignore par Noiz)"
                    value={persona.elevenLabsModelId}
                    onChange={(value) => update("elevenLabsModelId", value)}
                  />
                </div>
              </Section>

              <Section title="Voix Clonees (Noiz)">
                <VoiceRecorder />
              </Section>

              <div className="flex items-center gap-3">
                <button
                  className="rounded-xl bg-foreground px-4 py-2 text-sm text-background disabled:opacity-60"
                  disabled={saving}
                  onClick={save}
                  type="button"
                >
                  {saving ? "Sauvegarde..." : "Sauvegarder la configuration"}
                </button>
                {status ? (
                  <p className="text-sm text-muted-foreground">{status}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-6">
              <Section title="Knowledge Base Branchee">
                <PreviewList
                  emptyLabel="Aucune entree knowledge_base active."
                  items={data.knowledgeBase.map((item) => ({
                    id: item.id,
                    title: `${item.categorie} · ${item.question}`,
                    body: item.reponse,
                  }))}
                />
              </Section>

              <Section title="Produits Utilises par le Prompt">
                <PreviewList
                  emptyLabel="Aucun produit actif."
                  items={data.products.map((item) => ({
                    id: item.id,
                    title: item.nom,
                    body: [
                      item.description,
                      item.prix_mensuel != null
                        ? `${item.prix_mensuel}/mois`
                        : null,
                      item.prix_annuel != null
                        ? `${item.prix_annuel}/an`
                        : null,
                      item.fonctionnalites,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  }))}
                />
              </Section>

              <Section title="Exemples Persona">
                <PreviewList
                  emptyLabel="Aucun exemple persona."
                  items={data.examples.map((item) => ({
                    id: item.id,
                    title: item.category,
                    body: `User: ${item.user_input}\nAssistant: ${item.persona_response}`,
                  }))}
                />
              </Section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card/70 p-4 md:p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
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
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      ) : (
        <input
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      )}
    </label>
  );
}

function PreviewList({
  items,
  emptyLabel,
}: {
  items: Array<{ id: number; title: string; body: string }>;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          className="rounded-xl border border-border bg-background p-3"
          key={item.id}
        >
          <p className="text-sm font-medium">{item.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {item.body}
          </p>
        </div>
      ))}
    </div>
  );
}
