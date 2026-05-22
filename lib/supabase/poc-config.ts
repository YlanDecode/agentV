type PersonaConfigRow = {
  id: number;
  name: string | null;
  role: string | null;
  language_style: string | null;
  typical_response_length: string | null;
  tone: string | null;
  recurring_expressions: string | null;
  forbidden_phrases: string | null;
  clone_system_prompt: string | null;
  clone_voice_system_prompt: string | null;
  groq_chat_model: string | null;
  groq_transcription_model: string | null;
  elevenlabs_voice_id: string | null;
  elevenlabs_model_id: string | null;
  updated_at: string | null;
};

type KnowledgeBaseRow = {
  id: number;
  categorie: string;
  langue: string | null;
  question: string;
  reponse: string;
  actif: boolean | null;
  priorite: number | null;
};

type ProductRow = {
  id: number;
  nom: string;
  prix_mensuel: number | null;
  prix_annuel: number | null;
  description: string | null;
  fonctionnalites: string | null;
  limite_users: number | null;
  essai_gratuit: number | null;
  actif: boolean | null;
};

type PersonaExampleRow = {
  id: number;
  category: string;
  user_input: string;
  persona_response: string;
};

export type CloneSettings = {
  cloneSystemPrompt: string;
  cloneVoiceSystemPrompt: string;
  groqChatModel: string;
  groqTranscriptionModel: string;
  elevenLabsVoiceId: string;
  elevenLabsModelId: string;
};

export type PersonaForm = {
  id?: number;
  name: string;
  role: string;
  languageStyle: string;
  typicalResponseLength: string;
  tone: string;
  recurringExpressions: string;
  forbiddenPhrases: string;
} & CloneSettings;

export type POCConfigPayload = {
  persona: PersonaForm;
  knowledgeBase: KnowledgeBaseRow[];
  products: ProductRow[];
  examples: PersonaExampleRow[];
};

const defaultCloneSettings: CloneSettings = {
  cloneSystemPrompt:
    process.env.CLONE_SYSTEM_PROMPT ??
    "Tu es un assistant francophone naturel, clair et utile.",
  cloneVoiceSystemPrompt:
    process.env.CLONE_VOICE_SYSTEM_PROMPT ??
    "Tu reponds pour une synthese vocale. Fais des phrases naturelles, concises, sans liste.",
  groqChatModel: process.env.GROQ_CHAT_MODEL ?? "llama-3.3-70b-versatile",
  groqTranscriptionModel:
    process.env.GROQ_TRANSCRIPTION_MODEL ?? "whisper-large-v3",
  elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? "pqHfZKP75CvOlQylNhV4",
  elevenLabsModelId:
    process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
};

const defaultPersonaForm: PersonaForm = {
  name: "Assistant",
  role: "Assistant commercial et produit",
  languageStyle: "Francais naturel, simple et professionnel",
  typicalResponseLength: "Court a moyen",
  tone: "Chaleureux, rassurant et precis",
  recurringExpressions: "Bien sur;Avec plaisir;Voici l'essentiel",
  forbiddenPhrases: "Je ne sais pas;Je suis une IA",
  ...defaultCloneSettings,
};

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
  }

  return { url, key };
}

async function supabaseFetch(path: string, init?: RequestInit) {
  const { url, key } = getSupabaseConfig();

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed (${response.status}) for ${path}`);
  }

  return response;
}

function mapPersona(row?: PersonaConfigRow | null): PersonaForm {
  return {
    id: row?.id,
    name: row?.name ?? defaultPersonaForm.name,
    role: row?.role ?? defaultPersonaForm.role,
    languageStyle: row?.language_style ?? defaultPersonaForm.languageStyle,
    typicalResponseLength:
      row?.typical_response_length ?? defaultPersonaForm.typicalResponseLength,
    tone: row?.tone ?? defaultPersonaForm.tone,
    recurringExpressions:
      row?.recurring_expressions ?? defaultPersonaForm.recurringExpressions,
    forbiddenPhrases:
      row?.forbidden_phrases ?? defaultPersonaForm.forbiddenPhrases,
    cloneSystemPrompt:
      row?.clone_system_prompt ?? defaultPersonaForm.cloneSystemPrompt,
    cloneVoiceSystemPrompt:
      row?.clone_voice_system_prompt ??
      defaultPersonaForm.cloneVoiceSystemPrompt,
    groqChatModel: row?.groq_chat_model ?? defaultPersonaForm.groqChatModel,
    groqTranscriptionModel:
      row?.groq_transcription_model ??
      defaultPersonaForm.groqTranscriptionModel,
    elevenLabsVoiceId:
      row?.elevenlabs_voice_id ?? defaultPersonaForm.elevenLabsVoiceId,
    elevenLabsModelId:
      row?.elevenlabs_model_id ?? defaultPersonaForm.elevenLabsModelId,
  };
}

export async function getPOCConfig(): Promise<POCConfigPayload> {
  const [
    personaResponse,
    knowledgeResponse,
    productsResponse,
    examplesResponse,
  ] = await Promise.all([
    supabaseFetch(
      "persona_config?select=*&order=updated_at.desc.nullslast,id.desc&limit=1"
    ),
    supabaseFetch(
      "knowledge_base?select=id,categorie,langue,question,reponse,actif,priorite&actif=eq.true&order=priorite.desc.nullslast,id.asc&limit=12"
    ),
    supabaseFetch(
      "products?select=id,nom,prix_mensuel,prix_annuel,description,fonctionnalites,limite_users,essai_gratuit,actif&actif=eq.true&order=id.asc&limit=12"
    ),
    supabaseFetch(
      "persona_examples?select=id,category,user_input,persona_response&order=id.desc&limit=8"
    ),
  ]);

  const [personaRows, knowledgeBase, products, examples] = await Promise.all([
    personaResponse.json() as Promise<PersonaConfigRow[]>,
    knowledgeResponse.json() as Promise<KnowledgeBaseRow[]>,
    productsResponse.json() as Promise<ProductRow[]>,
    examplesResponse.json() as Promise<PersonaExampleRow[]>,
  ]);

  return {
    persona: mapPersona(personaRows[0]),
    knowledgeBase,
    products,
    examples,
  };
}

export async function getCloneSettings(): Promise<CloneSettings> {
  const { persona } = await getPOCConfig();

  return {
    cloneSystemPrompt: persona.cloneSystemPrompt,
    cloneVoiceSystemPrompt: persona.cloneVoiceSystemPrompt,
    groqChatModel: persona.groqChatModel,
    groqTranscriptionModel: persona.groqTranscriptionModel,
    elevenLabsVoiceId: persona.elevenLabsVoiceId,
    elevenLabsModelId: persona.elevenLabsModelId,
  };
}

export async function savePOCConfig(persona: PersonaForm) {
  const payload = {
    name: persona.name,
    role: persona.role,
    language_style: persona.languageStyle,
    typical_response_length: persona.typicalResponseLength,
    tone: persona.tone,
    recurring_expressions: persona.recurringExpressions,
    forbidden_phrases: persona.forbiddenPhrases,
    clone_system_prompt: persona.cloneSystemPrompt,
    clone_voice_system_prompt: persona.cloneVoiceSystemPrompt,
    groq_chat_model: persona.groqChatModel,
    groq_transcription_model: persona.groqTranscriptionModel,
    elevenlabs_voice_id: persona.elevenLabsVoiceId,
    elevenlabs_model_id: persona.elevenLabsModelId,
    updated_at: new Date().toISOString(),
  };

  if (persona.id) {
    await supabaseFetch(`persona_config?id=eq.${persona.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    });
    return;
  }

  await supabaseFetch("persona_config", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });
}

export async function buildSystemPrompt(options: { mode: "text" | "voice" }) {
  const { persona, knowledgeBase, products, examples } = await getPOCConfig();
  const basePrompt =
    options.mode === "voice"
      ? persona.cloneVoiceSystemPrompt
      : persona.cloneSystemPrompt;

  const knowledgeSection = knowledgeBase.length
    ? knowledgeBase
        .map(
          (item) =>
            `- [${item.categorie}] Q: ${item.question}\n  R: ${item.reponse}`
        )
        .join("\n")
    : "- Aucune fiche de connaissance active.";

  const productsSection = products.length
    ? products
        .map((item) => {
          const pricing = [
            item.prix_mensuel != null ? `${item.prix_mensuel}/mois` : null,
            item.prix_annuel != null ? `${item.prix_annuel}/an` : null,
          ]
            .filter(Boolean)
            .join(" | ");

          return `- ${item.nom}: ${item.description ?? "Sans description"}${pricing ? ` (${pricing})` : ""}${item.fonctionnalites ? `\n  Fonctionnalites: ${item.fonctionnalites}` : ""}`;
        })
        .join("\n")
    : "- Aucun produit actif.";

  const examplesSection = examples.length
    ? examples
        .map(
          (item) =>
            `- ${item.category}\n  Utilisateur: ${item.user_input}\n  Reponse: ${item.persona_response}`
        )
        .join("\n")
    : "- Aucun exemple de persona.";

  return `${basePrompt}

Persona:
- Nom: ${persona.name}
- Role: ${persona.role}
- Ton: ${persona.tone}
- Style de langue: ${persona.languageStyle}
- Longueur attendue: ${persona.typicalResponseLength}
- Expressions recurrentes: ${persona.recurringExpressions}
- Expressions interdites: ${persona.forbiddenPhrases}

Base de connaissance:
${knowledgeSection}

Produits:
${productsSection}

Exemples de reponse:
${examplesSection}

Regles:
- Reponds en francais.
- Utilise d'abord les informations de la base de connaissance et des produits.
- Si une information manque, dis-le clairement sans inventer.
- Pour la voix, reste tres naturel et facile a prononcer.`;
}
