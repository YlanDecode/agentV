const DEFAULT_TIMEOUT_MS = 45000;

function normalizeBaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function getN8nBaseUrl() {
  const raw = process.env.N8N_BASE_URL;
  if (!raw) {
    throw new Error("N8N_BASE_URL is not configured");
  }

  return normalizeBaseUrl(raw);
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

export type N8nTextPayload = {
  session_id: string;
  message: string;
  channel: string;
  user_name: string;
};

export async function sendTextToN8n(payload: N8nTextPayload) {
  const base = getN8nBaseUrl();
  const endpoint = process.env.N8N_TEXT_WEBHOOK_PATH ?? "/webhook/chat/text";

  const response = await fetchWithTimeout(`${base}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`n8n text error (${response.status}): ${body}`);
  }

  return response;
}

export async function sendVoiceToN8n(formData: FormData) {
  const base = getN8nBaseUrl();
  const endpoint = process.env.N8N_VOICE_WEBHOOK_PATH ?? "/webhook/chat/voice";

  const response = await fetchWithTimeout(`${base}${endpoint}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`n8n voice error (${response.status}): ${body}`);
  }

  return response;
}

export function isN8nModeEnabled() {
  return Boolean(process.env.N8N_BASE_URL);
}
