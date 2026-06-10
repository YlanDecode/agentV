export function isF5TTSEnabled() {
  return Boolean(
    process.env.F5TTS_API_URL && process.env.F5TTS_REFERENCE_AUDIO_URL
  );
}

function shortenTextForTts(text: string, maxChars: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  const slice = normalized.slice(0, maxChars);
  const lastSentence = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? ")
  );
  if (lastSentence >= Math.floor(maxChars * 0.6)) {
    return slice.slice(0, lastSentence + 1).trim();
  }

  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxChars * 0.6)) {
    return slice.slice(0, lastSpace).trim();
  }

  return slice.trim();
}

function splitTextForTts(text: string, maxChars: number) {
  const parts: string[] = [];
  let remaining = text.replace(/\s+/g, " ").trim();

  while (remaining) {
    const next = shortenTextForTts(remaining, maxChars);
    if (!next) {
      break;
    }

    parts.push(next);
    remaining = remaining.slice(next.length).trim();
  }

  return parts.length > 0 ? parts : [text.trim()];
}

function normalizeFrenchTextForTts(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([!?:;])/g, "$1")
    .replace(/([!?:;])(\S)/g, "$1 $2")
    .replace(/([,.])(\S)/g, "$1 $2")
    .trim();
}

type WavInfo = {
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  data: Uint8Array;
};

function parseWav(buffer: ArrayBuffer): WavInfo {
  const view = new DataView(buffer);
  const readTag = (offset: number) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );

  if (readTag(0) !== "RIFF" || readTag(8) !== "WAVE") {
    throw new Error("F5-TTS returned a non-WAV file");
  }

  let offset = 12;
  let fmt: Omit<WavInfo, "data"> | null = null;
  let data: Uint8Array | null = null;

  while (offset + 8 <= buffer.byteLength) {
    const chunkId = readTag(offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;

    if (chunkId === "fmt " && chunkSize >= 16) {
      fmt = {
        audioFormat: view.getUint16(chunkStart, true),
        numChannels: view.getUint16(chunkStart + 2, true),
        sampleRate: view.getUint32(chunkStart + 4, true),
        byteRate: view.getUint32(chunkStart + 8, true),
        blockAlign: view.getUint16(chunkStart + 12, true),
        bitsPerSample: view.getUint16(chunkStart + 14, true),
      };
    }

    if (chunkId === "data") {
      data = new Uint8Array(buffer, chunkStart, chunkSize);
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!fmt || !data) {
    throw new Error("F5-TTS returned an invalid WAV payload");
  }

  return { ...fmt, data };
}

function concatWavBuffers(buffers: ArrayBuffer[]) {
  if (buffers.length === 1) {
    return buffers[0];
  }

  const wavs = buffers.map(parseWav);
  const base = wavs[0];

  for (const wav of wavs.slice(1)) {
    if (
      wav.audioFormat !== base.audioFormat ||
      wav.numChannels !== base.numChannels ||
      wav.sampleRate !== base.sampleRate ||
      wav.bitsPerSample !== base.bitsPerSample
    ) {
      throw new Error("F5-TTS returned incompatible WAV segments");
    }
  }

  const totalDataSize = wavs.reduce((sum, wav) => sum + wav.data.byteLength, 0);
  const combined = new ArrayBuffer(44 + totalDataSize);
  const view = new DataView(combined);
  const writeTag = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeTag(0, "RIFF");
  view.setUint32(4, 36 + totalDataSize, true);
  writeTag(8, "WAVE");
  writeTag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, base.audioFormat, true);
  view.setUint16(22, base.numChannels, true);
  view.setUint32(24, base.sampleRate, true);
  view.setUint32(28, base.byteRate, true);
  view.setUint16(32, base.blockAlign, true);
  view.setUint16(34, base.bitsPerSample, true);
  writeTag(36, "data");
  view.setUint32(40, totalDataSize, true);

  const output = new Uint8Array(combined);
  let writeOffset = 44;
  for (const wav of wavs) {
    output.set(wav.data, writeOffset);
    writeOffset += wav.data.byteLength;
  }

  return combined;
}

async function readGeneratedAudioUrl(
  sseRes: Response,
  apiUrl: string
): Promise<string> {
  if (!sseRes.ok || !sseRes.body) {
    throw new Error(`F5-TTS SSE stream failed (${sseRes.status})`);
  }

  const reader = sseRes.body.getReader();
  const decoder = new TextDecoder();
  let audioUrl: string | null = null;
  let lastEvent = "";

  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (line.trim()) {
        console.log("[F5TTS SSE]", line);
      }
      if (line.startsWith("event: ")) {
        lastEvent = line.slice(7).trim();
        continue;
      }
      if (!line.startsWith("data: ")) {
        continue;
      }
      const raw = line.slice(6);
      if (lastEvent === "error") {
        throw new Error(`F5-TTS error: ${raw}`);
      }
      try {
        const parsed = JSON.parse(raw);

        if (lastEvent === "complete" && Array.isArray(parsed)) {
          const item = parsed[0] as { url?: string; path?: string } | undefined;
          const found = item?.url ?? item?.path ?? null;
          if (found) {
            audioUrl = found.startsWith("http")
              ? found
              : `${apiUrl}/${found.replace(/^\//, "")}`;
            break outer;
          }
        }

        const legacy = parsed as {
          msg?: string;
          output?: { data?: Array<{ url?: string }> };
        };
        if (
          legacy.msg === "process_completed" &&
          legacy.output?.data?.[0]?.url
        ) {
          audioUrl = legacy.output.data[0].url ?? null;
          break outer;
        }
      } catch {
        // ligne SSE non-JSON, on ignore
      }
    }
  }

  if (!audioUrl) {
    throw new Error("F5-TTS n'a pas retourné d'URL audio");
  }

  return audioUrl;
}

async function generateSpeechSegment(params: {
  apiUrl: string;
  fnName: string;
  tokenQuery: string;
  authHeaders: Record<string, string>;
  gradioFile: {
    path: string;
    url: null;
    size: null;
    orig_name: string;
    mime_type: string;
    is_stream: boolean;
    meta: { _type: "gradio.FileData" };
  };
  text: string;
  inferTimestep: number;
  intelligibilityWeight: number;
  similarityWeight: number;
}) {
  const submitRes = await fetch(
    `${params.apiUrl}/gradio_api/call/${params.fnName}${params.tokenQuery}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...params.authHeaders },
      body: JSON.stringify({
        data: [
          params.gradioFile,
          params.text,
          params.inferTimestep,
          params.intelligibilityWeight,
          params.similarityWeight,
        ],
      }),
      cache: "no-store",
    }
  );

  if (!submitRes.ok) {
    throw new Error(
      `F5-TTS submit failed (${submitRes.status}): ${await submitRes.text()}`
    );
  }

  const { event_id } = (await submitRes.json()) as { event_id: string };
  const sseRes = await fetch(
    `${params.apiUrl}/gradio_api/call/${params.fnName}/${event_id}${params.tokenQuery}`,
    {
      headers: { ...params.authHeaders },
      cache: "no-store",
    }
  );

  const audioUrl = await readGeneratedAudioUrl(sseRes, params.apiUrl);
  const audioRes = await fetch(audioUrl, { cache: "no-store" });
  if (!audioRes.ok) {
    throw new Error(`F5-TTS audio download failed (${audioRes.status})`);
  }

  return audioRes;
}

/**
 * Appelle un espace Hugging Face F5-TTS via l'API Gradio v4.
 * Variables d'env requises :
 *   F5TTS_API_URL              ex: https://hf-audio-f5-tts.hf.space
 *   F5TTS_REFERENCE_AUDIO_URL  URL publique du fichier WAV de référence (voix par défaut)
 * Variables d'env optionnelles :
 *   F5TTS_REFERENCE_TEXT       Transcription exacte de l'audio de référence par défaut
 *   F5TTS_INFER_TIMESTEP       Nombre d'etapes d'inference (defaut: 32)
 *   F5TTS_INTELLIGIBILITY_WEIGHT  Priorite a l'intelligibilite (defaut: 1.8)
 *   F5TTS_SIMILARITY_WEIGHT    Priorite a la similarite vocale (defaut: 2.2)
 *
 * Les options refAudioUrl / refText permettent de passer une voix choisie par l'utilisateur
 * (prioritaire sur les variables d'env). Ce Space ignore actuellement refText.
 */
export async function f5ttsTextToSpeech(
  text: string,
  options?: { refAudioUrl?: string; refText?: string }
): Promise<Response> {
  const apiUrl = process.env.F5TTS_API_URL;
  const refAudioUrl =
    options?.refAudioUrl ?? process.env.F5TTS_REFERENCE_AUDIO_URL;
  const _refText = options?.refText ?? process.env.F5TTS_REFERENCE_TEXT ?? "";

  if (!apiUrl) {
    throw new Error("F5TTS_API_URL not configured");
  }
  if (!refAudioUrl) {
    throw new Error(
      "No reference audio URL (set F5TTS_REFERENCE_AUDIO_URL or select a voice in the agent)"
    );
  }

  const fnName = process.env.F5TTS_FN_NAME ?? "basic_tts";
  const maxChars = Number(process.env.F5TTS_MAX_CHARS ?? "400");
  const inferTimestep = Number(process.env.F5TTS_INFER_TIMESTEP ?? "32");
  const intelligibilityWeight = Number(
    process.env.F5TTS_INTELLIGIBILITY_WEIGHT ?? "1.8"
  );
  const similarityWeight = Number(process.env.F5TTS_SIMILARITY_WEIGHT ?? "2.2");

  const hfToken = process.env.HF_TOKEN;
  const authHeaders: Record<string, string> = hfToken
    ? { Authorization: `Bearer ${hfToken}` }
    : {};
  const tokenQuery = hfToken ? `?hf_token=${hfToken}` : "";

  // Certains espaces F5-TTS exposent aussi le texte de référence; ce déploiement l'ignore.

  // Étape 1 : télécharger l'audio de référence depuis Supabase
  const audioDownload = await fetch(refAudioUrl, { cache: "no-store" });
  if (!audioDownload.ok) {
    throw new Error(
      `Failed to download reference audio (${audioDownload.status})`
    );
  }
  const audioBuffer = await audioDownload.arrayBuffer();
  const audioContentType =
    audioDownload.headers.get("Content-Type") ?? "audio/wav";
  const gradioFile = (path: string) => ({
    path,
    url: null,
    size: null,
    orig_name: "reference.wav",
    mime_type: audioContentType,
    is_stream: false,
    meta: { _type: "gradio.FileData" as const },
  });

  // Étape 2 : uploader l'audio vers le Space HuggingFace
  const uploadForm = new FormData();
  uploadForm.append(
    "files",
    new Blob([audioBuffer], { type: audioContentType }),
    "reference.wav"
  );
  const uploadRes = await fetch(`${apiUrl}/gradio_api/upload${tokenQuery}`, {
    method: "POST",
    headers: { ...authHeaders },
    body: uploadForm,
    cache: "no-store",
  });
  if (!uploadRes.ok) {
    throw new Error(
      `HF upload failed (${uploadRes.status}): ${await uploadRes.text()}`
    );
  }
  const uploadedPaths = (await uploadRes.json()) as string[];
  const uploadedPath = uploadedPaths[0];
  const normalizedText = normalizeFrenchTextForTts(text);
  const textChunks = splitTextForTts(normalizedText, maxChars).filter(Boolean);
  const audioBuffers: ArrayBuffer[] = [];
  let contentType = "audio/wav";

  for (const [index, chunk] of textChunks.entries()) {
    const audioRes = await generateSpeechSegment({
      apiUrl,
      fnName,
      tokenQuery,
      authHeaders,
      gradioFile: gradioFile(uploadedPath),
      text: chunk,
      inferTimestep,
      intelligibilityWeight,
      similarityWeight,
    });
    contentType = audioRes.headers.get("Content-Type") ?? contentType;
    audioBuffers.push(await audioRes.arrayBuffer());

    if (textChunks.length > 1) {
      console.log(
        `[F5TTS chunk] ${index + 1}/${textChunks.length} (${chunk.length} chars)`
      );
    }
  }

  const mergedAudio = concatWavBuffers(audioBuffers);
  return new Response(mergedAudio, {
    status: 200,
    headers: { "Content-Type": contentType },
  });
}
