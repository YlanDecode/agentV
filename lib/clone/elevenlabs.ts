const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

function getElevenLabsApiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }
  return key;
}

export function isElevenLabsEnabled() {
  return (
    Boolean(process.env.ELEVENLABS_API_KEY) &&
    process.env.ELEVENLABS_ENABLED !== "false"
  );
}

export async function elevenLabsTextToSpeech(
  text: string,
  options?: { voiceId?: string; modelId?: string; languageCode?: string }
) {
  const voiceId =
    options?.voiceId ??
    process.env.ELEVENLABS_VOICE_ID ??
    "pqHfZKP75CvOlQylNhV4";
  const languageCode =
    options?.languageCode ?? process.env.ELEVENLABS_LANGUAGE_CODE ?? "fr";

  const response = await fetch(
    `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": getElevenLabsApiKey(),
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id:
          options?.modelId ??
          process.env.ELEVENLABS_MODEL_ID ??
          "eleven_multilingual_v2",
        language_code: languageCode,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `ElevenLabs failed (${response.status}): ${await response.text()}`
    );
  }

  return response;
}
