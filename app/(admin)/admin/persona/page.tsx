"use client";

import { ChevronDownIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  fetchCloneConfig,
  type PromptMode,
  fetchPromptConfig,
  saveCloneConfig,
  savePromptConfig,
} from '@/lib/agentvocal-admin-api';
import { Badge } from '@/components/ui/badge';
import { getApiErrorMessage } from '@/lib/axios';

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

type PromptEditorState = {
  instructionsText: string;
  manifestText: string;
  blacklistText: string;
};

type UiMessageTone = 'success' | 'error' | 'warning' | 'info';

const EMPTY_PROMPT_EDITOR: PromptEditorState = {
  instructionsText: '',
  manifestText: '',
  blacklistText: '',
};

function parseInstructionLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function joinInstructionLines(value: string[] | string | undefined) {
  if (Array.isArray(value)) {
    return value.join('\n');
  }
  return typeof value === 'string' ? value : '';
}

function labelForMode(mode: PromptMode) {
  return mode === 'chat' ? 'texte' : 'voix';
}

export default function PersonaPage() {
  const [persona, setPersona] = useState<PersonaForm>(emptyPersona);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: UiMessageTone; message: string } | null>(null);
  const [promptSources, setPromptSources] = useState<{ chat?: string; voice?: string }>({});
  const [promptEditorMode, setPromptEditorMode] = useState<PromptMode>('chat');
  const [promptEditors, setPromptEditors] = useState<Record<PromptMode, PromptEditorState>>({
    chat: EMPTY_PROMPT_EDITOR,
    voice: EMPTY_PROMPT_EDITOR,
  });
  const [modelsOpen, setModelsOpen] = useState(false);
  const [ttsOpen, setTtsOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [config, chatPrompt, voicePrompt] = await Promise.all([
          fetchCloneConfig(),
          fetchPromptConfig('chat'),
          fetchPromptConfig('voice'),
        ]);

        setPersona({
          ...config.persona,
          cloneSystemPrompt: chatPrompt.content || config.persona.cloneSystemPrompt,
          cloneVoiceSystemPrompt: voicePrompt.content || config.persona.cloneVoiceSystemPrompt,
        });
        setPromptEditors({
          chat: {
            instructionsText: joinInstructionLines(chatPrompt.instructions),
            manifestText: joinInstructionLines(chatPrompt.manifest),
            blacklistText: joinInstructionLines(chatPrompt.blacklist),
          },
          voice: {
            instructionsText: joinInstructionLines(voicePrompt.instructions),
            manifestText: joinInstructionLines(voicePrompt.manifest),
            blacklistText: joinInstructionLines(voicePrompt.blacklist),
          },
        });
        setPromptSources({ chat: chatPrompt.source, voice: voicePrompt.source });
      } catch (error) {
        setStatus({
          tone: 'error',
          message: getApiErrorMessage(error, 'Impossible de charger la configuration Persona et les prompts dynamiques.'),
        });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const update = (key: keyof PersonaForm, value: string) =>
    setPersona((c) => ({ ...c, [key]: value }));

  const updatePromptEditor = (
    mode: PromptMode,
    key: keyof PromptEditorState,
    value: string
  ) => {
    setPromptEditors((current) => ({
      ...current,
      [mode]: {
        ...current[mode],
        [key]: value,
      },
    }));
  };

  const modeStates = {
    chat: {
      configured: Boolean(persona.cloneSystemPrompt.trim()),
      source: promptSources.chat ?? 'inconnue',
      instructionsCount: parseInstructionLines(promptEditors.chat.instructionsText).length,
      blacklistCount: parseInstructionLines(promptEditors.chat.blacklistText).length,
      manifestReady: Boolean(promptEditors.chat.manifestText.trim()),
    },
    voice: {
      configured: Boolean(persona.cloneVoiceSystemPrompt.trim()),
      source: promptSources.voice ?? 'inconnue',
      instructionsCount: parseInstructionLines(promptEditors.voice.instructionsText).length,
      blacklistCount: parseInstructionLines(promptEditors.voice.blacklistText).length,
      manifestReady: Boolean(promptEditors.voice.manifestText.trim()),
    },
  };

  const selectedModeState = modeStates[promptEditorMode];
  const unconfiguredModes = (Object.entries(modeStates) as Array<[PromptMode, typeof selectedModeState]>)
    .filter(([, value]) => !value.configured)
    .map(([mode]) => labelForMode(mode));

  const save = async () => {
    setSaving(true);
    setStatus(null);

    try {
      const chatInstructions = parseInstructionLines(promptEditors.chat.instructionsText);
      const chatManifest = promptEditors.chat.manifestText.trim();
      const chatBlacklist = parseInstructionLines(promptEditors.chat.blacklistText);
      const voiceInstructions = parseInstructionLines(promptEditors.voice.instructionsText);
      const voiceManifest = promptEditors.voice.manifestText.trim();
      const voiceBlacklist = parseInstructionLines(promptEditors.voice.blacklistText);

      const [config, chatPrompt, voicePrompt] = await Promise.all([
        saveCloneConfig(persona),
        savePromptConfig(
          'chat',
          persona.cloneSystemPrompt,
          { screen: 'admin/persona' },
          chatInstructions,
          chatManifest,
          chatBlacklist,
        ),
        savePromptConfig(
          'voice',
          persona.cloneVoiceSystemPrompt,
          { screen: 'admin/persona' },
          voiceInstructions,
          voiceManifest,
          voiceBlacklist,
        ),
      ]);

      setPersona({
        ...config.persona,
        cloneSystemPrompt: chatPrompt.content,
        cloneVoiceSystemPrompt: voicePrompt.content,
      });
      setPromptEditors({
        chat: {
          instructionsText: joinInstructionLines(chatPrompt.instructions),
          manifestText: joinInstructionLines(chatPrompt.manifest),
          blacklistText: joinInstructionLines(chatPrompt.blacklist),
        },
        voice: {
          instructionsText: joinInstructionLines(voicePrompt.instructions),
          manifestText: joinInstructionLines(voicePrompt.manifest),
          blacklistText: joinInstructionLines(voicePrompt.blacklist),
        },
      });
      setPromptSources({ chat: chatPrompt.source, voice: voicePrompt.source });
      setStatus({ tone: 'success', message: 'Configuration Persona et prompts sauvegardés.' });
    } catch (error) {
      setStatus({
        tone: 'error',
        message: getApiErrorMessage(error, 'Échec de la sauvegarde de la configuration.'),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageShell title="Assistant"><p className="text-sm text-muted-foreground">Chargement...</p></PageShell>;
  }

  return (
    <PageShell
      title="Assistant"
      subtitle="Le ton, les prompts et la stack runtime sont réunis ici pour éviter les réglages dispersés."
      action={
        <div className="flex items-center gap-3">
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
      <section className="rounded-3xl border border-border/70 bg-card/70 p-5 md:p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-border bg-background/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Voix du bot</p>
            <p className="mt-2 text-sm font-medium text-foreground">Définissez sa posture</p>
            <p className="mt-1 text-sm text-muted-foreground">Nom, rôle, ton et style de langage.</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Prompts runtime</p>
            <p className="mt-2 text-sm font-medium text-foreground">Un seul point d&apos;édition</p>
            <p className="mt-1 text-sm text-muted-foreground">Les prompts texte et voix sont sauvegardés dynamiquement.</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Stack modèle</p>
            <p className="mt-2 text-sm font-medium text-foreground">Gardez l&apos;essentiel visible</p>
            <p className="mt-1 text-sm text-muted-foreground">Chat, transcription et TTS principal au même endroit.</p>
          </div>
        </div>
      </section>

      {status ? <MessageBanner message={status.message} tone={status.tone} /> : null}

      {unconfiguredModes.length > 0 ? (
        <MessageBanner
          message={`Prompt principal non configuré pour le mode ${unconfiguredModes.join(' et ')}. Tant qu'il reste vide, l'agent répond sans cadre éditorial spécifique pour ce mode.`}
          tone="warning"
        />
      ) : null}

      <div className="space-y-6">
        <Section title="Identité de l'assistant" description="Ce bloc définit la façon dont l'assistant se présente et s'exprime." >
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

        <Section title="Prompts dynamiques" description="Ces deux prompts sont ceux utilisés en runtime par le backend AgentVOCAL." >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">
              Cette zone est entièrement dynamique: rien n&apos;est prérempli automatiquement côté interface.
            </p>
            <p className="text-xs text-muted-foreground">
              Source runtime: texte {promptSources.chat ?? 'inconnue'} · voix {promptSources.voice ?? 'inconnue'}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <div className="rounded-2xl border border-border bg-card/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Modes</p>
              <div className="mt-3 space-y-2">
                {([
                  { mode: 'chat' as const, label: 'Texte', subtitle: 'Réponses écrites' },
                  { mode: 'voice' as const, label: 'Voix', subtitle: 'Réponses prononcées' },
                ]).map((item) => {
                  const active = promptEditorMode === item.mode;
                  const itemState = modeStates[item.mode];

                  return (
                    <button
                      className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${active ? 'border-foreground/20 bg-foreground text-background' : 'border-border bg-background text-foreground hover:bg-muted'}`}
                      key={item.mode}
                      onClick={() => setPromptEditorMode(item.mode)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm font-medium ${active ? 'text-white' : 'text-foreground'}`}>{item.label}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant={active ? 'secondary' : 'outline'}>{item.mode}</Badge>
                          {!itemState.configured ? (
                            <Badge variant="destructive">non configuré</Badge>
                          ) : (
                            <Badge variant={active ? 'secondary' : 'outline'}>actif</Badge>
                          )}
                        </div>
                      </div>
                      <p className={`mt-1 text-xs ${active ? 'text-white/70' : 'text-muted-foreground'}`}>{item.subtitle}</p>
                      <p className={`mt-2 text-[11px] ${active ? 'text-white/70' : 'text-muted-foreground'}`}>
                        source: {itemState.source} · {itemState.instructionsCount} instruction{itemState.instructionsCount > 1 ? 's' : ''} · {itemState.manifestReady ? 'manifeste prêt' : 'manifeste vide'} · {itemState.blacklistCount} interdit{itemState.blacklistCount > 1 ? 's' : ''}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{promptEditorMode === 'chat' ? 'Prompt texte' : 'Prompt voix'}</Badge>
                {!selectedModeState.configured ? <Badge variant="destructive">non configuré</Badge> : null}
                <p className="text-xs text-muted-foreground">
                  Une ligne = une entrée pour les instructions ou la blacklist.
                </p>
              </div>

              {!selectedModeState.configured ? (
                <div className="mt-4">
                  <MessageBanner
                    message={`Le prompt principal du mode ${labelForMode(promptEditorMode)} est vide. Renseignez-le puis sauvegardez pour activer un vrai cadre de réponse.`}
                    tone="warning"
                  />
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <StatTile label="Source" value={selectedModeState.source} />
                <StatTile label="Instructions" value={String(selectedModeState.instructionsCount)} />
                <StatTile label="Blacklist" value={String(selectedModeState.blacklistCount)} />
              </div>

              {promptEditorMode === 'chat' ? (
                <div className="mt-4 space-y-4">
                  <Field label="Prompt principal" multiline value={persona.cloneSystemPrompt} onChange={(v) => update("cloneSystemPrompt", v)} />
                  <Field
                    label="Instructions complémentaires"
                    multiline
                    placeholder="Ex: Toujours répondre en français\nEx: Prioriser les informations issues du corpus"
                    value={promptEditors.chat.instructionsText}
                    onChange={(v) => updatePromptEditor('chat', 'instructionsText', v)}
                  />
                  <Field
                    label="Manifeste de marque"
                    multiline
                    placeholder={"Ex: Créer Ailleurs est la launchpad intellectuelle pour celles et ceux qui décident de reconstruire ailleurs.\nEx: Ce n'est pas une fuite, c'est une décision architecturale sur sa propre vie."}
                    value={promptEditors.chat.manifestText}
                    onChange={(v) => updatePromptEditor('chat', 'manifestText', v)}
                  />
                  <Field
                    label="Blacklist de réponse"
                    multiline
                    placeholder={"Ex: Ne jamais promettre un délai non confirmé\nEx: Ne jamais dire 'je suis une IA'"}
                    value={promptEditors.chat.blacklistText}
                    onChange={(v) => updatePromptEditor('chat', 'blacklistText', v)}
                  />
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <Field label="Prompt principal" multiline value={persona.cloneVoiceSystemPrompt} onChange={(v) => update("cloneVoiceSystemPrompt", v)} />
                  <Field
                    label="Instructions complémentaires"
                    multiline
                    placeholder="Ex: Garder une idée par phrase\nEx: Parler comme un humain au téléphone"
                    value={promptEditors.voice.instructionsText}
                    onChange={(v) => updatePromptEditor('voice', 'instructionsText', v)}
                  />
                  <Field
                    label="Manifeste de marque"
                    multiline
                    placeholder={"Ex: Créer Ailleurs parle de reconstruction assumée, digne et structurée.\nEx: Le départ ailleurs n'est jamais raconté comme une fuite."}
                    value={promptEditors.voice.manifestText}
                    onChange={(v) => updatePromptEditor('voice', 'manifestText', v)}
                  />
                  <Field
                    label="Blacklist de réponse"
                    multiline
                    placeholder="Ex: Ne jamais utiliser un ton théâtral\nEx: Ne jamais faire de blague"
                    value={promptEditors.voice.blacklistText}
                    onChange={(v) => updatePromptEditor('voice', 'blacklistText', v)}
                  />
                </div>
              )}
            </div>
          </div>
        </Section>

        <CollapsibleSection
          description="Les modèles principaux restent disponibles, mais cachés tant que vous n'avez pas besoin d'y toucher."
          onOpenChange={setModelsOpen}
          open={modelsOpen}
          title="Réglages avancés des modèles"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Groq chat model" value={persona.groqChatModel} onChange={(v) => update("groqChatModel", v)} />
            <Field label="Groq transcription model" value={persona.groqTranscriptionModel} onChange={(v) => update("groqTranscriptionModel", v)} />
            <Field label="ElevenLabs voice ID (legacy)" value={persona.elevenLabsVoiceId} onChange={(v) => update("elevenLabsVoiceId", v)} />
            <Field label="ElevenLabs model ID (legacy)" value={persona.elevenLabsModelId} onChange={(v) => update("elevenLabsModelId", v)} />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          description="Ouvrez cette zone uniquement si vous devez changer le provider TTS ou la configuration Fish Audio."
          onOpenChange={setTtsOpen}
          open={ttsOpen}
          title="Réglages avancés de synthèse"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="TTS provider" value={persona.ttsProvider} onChange={(v) => update("ttsProvider", v)} />
            <Field label="Fish reference ID par défaut" value={persona.fishReferenceId} onChange={(v) => update("fishReferenceId", v)} />
            <Field label="Fish model" value={persona.fishTtsModel} onChange={(v) => update("fishTtsModel", v)} />
            <Field label="Fish latency" value={persona.fishTtsLatency} onChange={(v) => update("fishTtsLatency", v)} />
          </div>
        </CollapsibleSection>
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
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-3xl border border-border/70 bg-card/70 p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            {subtitle && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{subtitle}</p>}
          </div>
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border/70 bg-background/80 p-5 md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function CollapsibleSection({
  title,
  description,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible onOpenChange={onOpenChange} open={open}>
      <section className="rounded-3xl border border-border/70 bg-background/80">
        <CollapsibleTrigger asChild>
          <button
            className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left md:px-6"
            type="button"
          >
            <div>
              <h2 className="text-lg font-semibold text-foreground">{title}</h2>
              {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
            </div>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
              <ChevronDownIcon className={`size-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border/70 px-5 py-5 md:px-6">{children}</div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea
          className="min-h-28 rounded-2xl border border-border bg-background px-3 py-2 text-sm"
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          value={value}
        />
      ) : (
        <input
          className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          value={value}
        />
      )}
    </label>
  );
}

function MessageBanner({ message, tone }: { message: string; tone: UiMessageTone }) {
  const styles = {
    success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    error: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300',
    warning: 'border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300',
    info: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  } as const;

  const labels = {
    success: 'Succès',
    error: 'Erreur',
    warning: 'Attention',
    info: 'Information',
  } as const;

  return (
    <div className={`rounded-2xl border px-4 py-3 ${styles[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em]">{labels[tone]}</p>
      <p className="mt-1 text-sm leading-6">{message}</p>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value || 'vide'}</p>
    </div>
  );
}
