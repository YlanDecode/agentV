import {
  elevenLabsTextToSpeech,
  isElevenLabsEnabled,
} from "@/lib/clone/elevenlabs";
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
  const isDirectVoiceEnabled = isGroqCloneEnabled() && isElevenLabsEnabled();

  if (!isDirectVoiceEnabled && !isN8nModeEnabled()) {
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

  try {
    if (isDirectVoiceEnabled) {
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
      headers.set("X-Transcription", transcription);
      headers.set("X-Assistant-Text", encodeURIComponent(textResponse));

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

      return new Response(audioBuffer, { status: 200, headers });
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
