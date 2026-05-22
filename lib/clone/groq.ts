const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

type CloneMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function getGroqApiKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error("GROQ_API_KEY is not configured");
  }
  return key;
}

export function isGroqCloneEnabled() {
  return Boolean(process.env.GROQ_API_KEY);
}

export async function groqChatCompletion(
  messages: CloneMessage[],
  model?: string
) {
  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getGroqApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model ?? process.env.GROQ_CHAT_MODEL ?? "llama-3.3-70b-versatile",
      temperature: 0.4,
      messages,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Groq chat failed (${response.status}): ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return payload.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function groqChatCompletionStream(
  messages: CloneMessage[],
  model?: string
) {
  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getGroqApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model ?? process.env.GROQ_CHAT_MODEL ?? "llama-3.3-70b-versatile",
      temperature: 0.4,
      stream: true,
      messages,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Groq stream failed (${response.status}): ${await response.text()}`);
  }

  return response;
}

export async function groqTranscribeAudio(file: File, model?: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append(
    "model",
    model ?? process.env.GROQ_TRANSCRIPTION_MODEL ?? "whisper-large-v3-turbo"
  );
  formData.append("language", "fr");

  const response = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getGroqApiKey()}`,
    },
    body: formData,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Groq transcription failed (${response.status}): ${await response.text()}`
    );
  }

  const payload = (await response.json()) as { text?: string };
  return payload.text?.trim() ?? "";
}
