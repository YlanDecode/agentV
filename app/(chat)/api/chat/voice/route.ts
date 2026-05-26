import {
  elevenLabsTextToSpeech,
  isElevenLabsEnabled,
} from "@/lib/clone/elevenlabs";
import { f5ttsTextToSpeech, isF5TTSEnabled } from "@/lib/clone/f5tts";
import {
  groqChatCompletion,
  groqTranscribeAudio,
  isGroqCloneEnabled,
} from "@/lib/clone/groq";
import { isN8nModeEnabled, sendVoiceToN8n } from "@/lib/n8n/client";
import { saveConversationToSupabase } from "@/lib/supabase/conversations";
import { buildSystemPrompt, getCloneSettings } from "@/lib/supabase/poc-config";

export const maxDuration = 60;

export async function POST(request: Request) {
  const hasGroq = isGroqCloneEnabled();

  if (!hasGroq && !isN8nModeEnabled()) {
    return Response.json(
      { error: "Voice endpoint is not configured" },
      { status: 400 }
    );
  }

  const body = await request.formData();
  const audio = body.get("audio");

  if (!(audio instanceof File)) {
    return Response.json({ error: "Missing audio file" }, { status: 400 });
  }

  const sessionId = String(body.get("session_id") ?? crypto.randomUUID());
  const channel = String(body.get("channel") ?? "web");
  const userName = String(body.get("user_name") ?? "Utilisateur");
  const voiceUrl = body.get("voice_url") ? String(body.get("voice_url")) : null;
  const voiceReferenceText = body.get("voice_reference_text")
    ? String(body.get("voice_reference_text"))
    : null;

  try {
    if (hasGroq) {
      const cloneSettings = await getCloneSettings();
      const voiceSystemPrompt = await buildSystemPrompt({ mode: "voice" });
      const transcription = await groqTranscribeAudio(
        audio,
        cloneSettings.groqTranscriptionModel
      );
      const textResponse = await groqChatCompletion(
        [
          {
            role: "system",
            content: voiceSystemPrompt,
          },
          {
            role: "user",
            content: `[session:${sessionId}][channel:${channel}][name:${userName}] ${transcription}`,
          },
        ],
        cloneSettings.groqChatModel
      );

      try {
        await saveConversationToSupabase({
          sessionId,
          userName,
          userMessage: transcription,
          botResponse: textResponse,
          channel,
        });
      } catch (error) {
        console.error("Failed to save voice conversation", error);
      }

      // Priorité TTS : ElevenLabs → F5-TTS → SpeechSynthesis (navigateur)
      if (isElevenLabsEnabled()) {
        const tts = await elevenLabsTextToSpeech(textResponse, {
          voiceId: cloneSettings.elevenLabsVoiceId,
          modelId: cloneSettings.elevenLabsModelId,
        });
        const audioBuffer = await tts.arrayBuffer();
        const headers = new Headers();
        headers.set(
          "Content-Type",
          tts.headers.get("Content-Type") ?? "audio/mpeg"
        );
        headers.set("X-Session-Id", sessionId);
        headers.set("X-Transcription", encodeURIComponent(transcription));
        headers.set("X-Assistant-Text", encodeURIComponent(textResponse));
        return new Response(audioBuffer, { status: 200, headers });
      }

      if (isF5TTSEnabled() || (voiceUrl && process.env.F5TTS_API_URL)) {
        try {
          const tts = await f5ttsTextToSpeech(textResponse, {
            refAudioUrl: voiceUrl ?? undefined,
            refText: voiceReferenceText ?? undefined,
          });
          const audioBuffer = await tts.arrayBuffer();
          const headers = new Headers();
          headers.set(
            "Content-Type",
            tts.headers.get("Content-Type") ?? "audio/wav"
          );
          headers.set("X-Session-Id", sessionId);
          headers.set("X-Transcription", encodeURIComponent(transcription));
          headers.set("X-Assistant-Text", encodeURIComponent(textResponse));
          return new Response(audioBuffer, { status: 200, headers });
        } catch (error) {
          console.warn("F5-TTS failed, falling back to browser TTS", error);
        }
      }

      // Fallback : retourner le texte pour que le navigateur parle via speechSynthesis
      const headers = new Headers();
      headers.set("Content-Type", "application/json");
      headers.set("X-Session-Id", sessionId);
      headers.set("X-Transcription", encodeURIComponent(transcription));
      headers.set("X-Assistant-Text", encodeURIComponent(textResponse));
      return new Response(JSON.stringify({ text: textResponse }), {
        status: 200,
        headers,
      });
    }

    const formData = new FormData();
    formData.append("audio", audio);
    formData.append("session_id", sessionId);
    formData.append("channel", channel);
    formData.append("user_name", userName);

    const upstream = await sendVoiceToN8n(formData);
    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstream.headers.get("Content-Type") ?? "audio/mpeg"
    );

    const maybeSessionId = upstream.headers.get("X-Session-Id");
    if (maybeSessionId) {
      headers.set("X-Session-Id", maybeSessionId);
    }

    const maybeTranscription = upstream.headers.get("X-Transcription");
    if (maybeTranscription) {
      headers.set("X-Transcription", maybeTranscription);
    }

    const maybeAssistantText = upstream.headers.get("X-Assistant-Text");
    if (maybeAssistantText) {
      headers.set("X-Assistant-Text", maybeAssistantText);
    }

    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    console.error("Voice API error", error);
    return Response.json({ error: "Voice request failed" }, { status: 502 });
  }
}
