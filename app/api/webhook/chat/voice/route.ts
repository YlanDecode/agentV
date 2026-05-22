import {
  elevenLabsTextToSpeech,
  isElevenLabsEnabled,
} from "@/lib/clone/elevenlabs";
import {
  groqChatCompletion,
  groqTranscribeAudio,
  isGroqCloneEnabled,
} from "@/lib/clone/groq";
import { saveConversationToSupabase } from "@/lib/supabase/conversations";
import { buildSystemPrompt, getCloneSettings } from "@/lib/supabase/poc-config";

export async function POST(request: Request) {
  if (!isGroqCloneEnabled() || !isElevenLabsEnabled()) {
    return Response.json(
      {
        error:
          "GROQ_API_KEY and ELEVENLABS_API_KEY must be configured for voice mode",
      },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const audio = formData.get("audio");
  const sessionId = String(formData.get("session_id") ?? crypto.randomUUID());
  const channel = String(formData.get("channel") ?? "web");
  const userName = String(formData.get("user_name") ?? "Utilisateur");

  if (!(audio instanceof File)) {
    return Response.json({ error: "audio file is required" }, { status: 422 });
  }

  try {
    const cloneSettings = await getCloneSettings();
    const voiceSystemPrompt = await buildSystemPrompt({ mode: "voice" });
    const transcription = await groqTranscribeAudio(
      audio,
      cloneSettings.groqTranscriptionModel
    );
    if (!transcription) {
      return Response.json({ error: "empty transcription" }, { status: 422 });
    }

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

    const ttsResponse = await elevenLabsTextToSpeech(textResponse, {
      voiceId: cloneSettings.elevenLabsVoiceId,
      modelId: cloneSettings.elevenLabsModelId,
    });
    const audioBuffer = await ttsResponse.arrayBuffer();

    try {
      await saveConversationToSupabase({
        sessionId,
        userName,
        userMessage: transcription,
        botResponse: textResponse,
        channel,
      });
    } catch (error) {
      console.error("Failed to save webhook voice conversation", error);
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      ttsResponse.headers.get("Content-Type") ?? "audio/mpeg"
    );
    headers.set("X-Session-Id", sessionId);
    headers.set("X-Transcription", transcription);
    headers.set("X-Assistant-Text", encodeURIComponent(textResponse));

    return new Response(audioBuffer, { status: 200, headers });
  } catch (error) {
    console.error("Webhook voice error", error);
    return Response.json({ error: "voice processing failed" }, { status: 502 });
  }
}
