"use client";

import Link from "next/link";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { RagDocuments } from "@/components/rag/rag-documents";
import Papa from "papaparse";
import { useEffect, useMemo, useRef, useState } from "react";

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

type ImportedKnowledgeEntry = {
  question: string;
  reponse: string;
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

export default function SettingsPage() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [persona, setPersona] = useState<PersonaForm>(emptyPersona);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [uploadingKnowledge, setUploadingKnowledge] = useState(false);
  const knowledgeInputRef = useRef<HTMLInputElement | null>(null);

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

  const reload = async () => {
    const response = await fetch("/api/settings/clone", {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Impossible de recharger la configuration.");
    }
    const payload = (await response.json()) as SettingsPayload;
    setData(payload);
    setPersona(payload.persona);
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

  const applySeriousPrompts = () => {
    setPersona((current) => ({
      ...current,
      cloneSystemPrompt: SERIOUS_TEXT_PROMPT,
      cloneVoiceSystemPrompt: SERIOUS_VOICE_PROMPT,
    }));
    setStatus("Preset de prompt sobre appliqué. Sauvegarde pour l'activer.");
  };

  const parseTextKnowledge = (content: string, sourceName: string): ImportedKnowledgeEntry[] => {
    const normalized = content.replace(/\r\n/g, "\n").trim();
    if (!normalized) return [];

    const qaMatches = [...normalized.matchAll(/(?:^|\n)Q\s*[:\-]\s*(.+?)\nA\s*[:\-]\s*([\s\S]*?)(?=\nQ\s*[:\-]|$)/gi)];
    if (qaMatches.length > 0) {
      return qaMatches
        .map((match) => ({
          question: match[1].trim(),
          reponse: match[2].trim(),
        }))
        .filter((entry) => entry.question && entry.reponse);
    }

    const paragraphs = normalized
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.replace(/^#+\s*/gm, "").trim())
      .filter((paragraph) => paragraph.length >= 40)
      .slice(0, 12);

    return paragraphs.map((paragraph, index) => ({
      question:
        index === 0
          ? `Quels sont les points importants dans ${sourceName} ?`
          : `Quel autre point important faut-il retenir de ${sourceName} ?`,
      reponse: paragraph,
    }));
  };

  const parseCsvKnowledge = (content: string, sourceName: string): ImportedKnowledgeEntry[] => {
    const parsed = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
    });

    const rows = Array.isArray(parsed.data) ? parsed.data : [];
    if (rows.length === 0) {
      return [];
    }

    const headers = Object.keys(rows[0] ?? {});
    const findHeader = (candidates: string[]) =>
      headers.find((header) => candidates.includes(header.trim().toLowerCase()));

    const questionHeader = findHeader(["question", "q", "demande"]);
    const answerHeader = findHeader(["reponse", "réponse", "answer", "a"]);

    if (questionHeader && answerHeader) {
      return rows
        .map((row) => ({
          question: String(row[questionHeader] ?? "").trim(),
          reponse: String(row[answerHeader] ?? "").trim(),
        }))
        .filter((entry) => entry.question && entry.reponse)
        .slice(0, 24);
    }

    if (headers.length >= 2) {
      return rows
        .map((row) => ({
          question: String(row[headers[0]] ?? "").trim(),
          reponse: headers.slice(1).map((header) => String(row[header] ?? "").trim()).filter(Boolean).join(" | "),
        }))
        .filter((entry) => entry.question && entry.reponse)
        .slice(0, 24);
    }

    const rawRows = Papa.parse<string[]>(content, {
      header: false,
      skipEmptyLines: true,
    }).data;

    return rawRows
      .map((row) => ({
        question: row[0]?.trim() ?? `Information importante de ${sourceName}`,
        reponse: row.slice(1).join(" | ").trim(),
      }))
      .filter((entry) => entry.question && entry.reponse)
      .slice(0, 24);
  };

  const parseKnowledgeFile = async (file: File) => {
    const content = await file.text();
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".csv") || file.type.includes("csv")) {
      return parseCsvKnowledge(content, file.name);
    }
    return parseTextKnowledge(content, file.name);
  };

  const importKnowledgeFiles = async (files: FileList | File[]) => {
    const selectedFiles = [...files].filter((file) => /\.(txt|md|markdown|csv)$/i.test(file.name));
    if (selectedFiles.length === 0) {
      setStatus("Aucun fichier compatible. Utilise .txt, .md ou .csv.");
      return;
    }

    setUploadingKnowledge(true);
    setStatus("");

    try {
      for (const file of selectedFiles) {
        const entries = await parseKnowledgeFile(file);
        if (entries.length === 0) {
          continue;
        }

        const response = await fetch("/api/settings/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceName: file.name, entries }),
        });

        if (!response.ok) {
          throw new Error(`Import impossible pour ${file.name}`);
        }
      }

      await reload();
      setStatus("Documents importés dans la base de connaissance.");
    } catch {
      setStatus("Erreur pendant l'import des documents.");
    } finally {
      setUploadingKnowledge(false);
    }
  };

  const knowledgeCategories = useMemo(() => {
    return Array.from(new Set((data?.knowledgeBase ?? []).map((item) => item.categorie)));
  }, [data]);

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
                    label="Ancien voice ID ElevenLabs (ignore par F5-TTS)"
                    value={persona.elevenLabsVoiceId}
                    onChange={(value) => update("elevenLabsVoiceId", value)}
                  />
                  <Field
                    label="Ancien model ID ElevenLabs (ignore par F5-TTS)"
                    value={persona.elevenLabsModelId}
                    onChange={(value) => update("elevenLabsModelId", value)}
                  />
                </div>
              </Section>

              <Section title="TTS Runtime">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="TTS provider"
                    value={persona.ttsProvider}
                    onChange={(value) => update("ttsProvider", value)}
                  />
                  <Field
                    label="Fish reference ID par defaut"
                    value={persona.fishReferenceId}
                    onChange={(value) => update("fishReferenceId", value)}
                  />
                  <Field
                    label="Fish model"
                    value={persona.fishTtsModel}
                    onChange={(value) => update("fishTtsModel", value)}
                  />
                  <Field
                    label="Fish latency"
                    value={persona.fishTtsLatency}
                    onChange={(value) => update("fishTtsLatency", value)}
                  />
                </div>
              </Section>

              <Section title="Voix Clonees (HuggingFace / F5-TTS)">
                <VoiceRecorder />
              </Section>

              <Section title="Base documentaire RAG">
                <RagDocuments />
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
                <div className="space-y-3 rounded-xl border border-dashed border-border bg-background p-4">
                  <input
                    accept=".txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv"
                    className="hidden"
                    multiple
                    onChange={(event) => {
                      if (event.currentTarget.files) {
                        void importKnowledgeFiles(event.currentTarget.files);
                      }
                      event.currentTarget.value = "";
                    }}
                    ref={knowledgeInputRef}
                    type="file"
                  />
                  <div
                    className="rounded-xl border border-dashed border-border/80 p-4 text-sm text-muted-foreground"
                    onDragOver={(event) => {
                      event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (event.dataTransfer.files?.length) {
                        void importKnowledgeFiles(event.dataTransfer.files);
                      }
                    }}
                  >
                    <p className="font-medium text-foreground">
                      Glisse-dépose des fichiers `.txt`, `.md` ou `.csv`
                    </p>
                    <p className="mt-1">
                      On extrait les Q/R explicites et les informations importantes pour les injecter dans la base de connaissance utilisée par le prompt.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        className="rounded-xl bg-foreground px-3 py-2 text-sm text-background disabled:opacity-60"
                        disabled={uploadingKnowledge}
                        onClick={() => knowledgeInputRef.current?.click()}
                        type="button"
                      >
                        {uploadingKnowledge ? "Import..." : "Choisir des fichiers"}
                      </button>
                      {knowledgeCategories.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Sources chargées: {knowledgeCategories.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
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
