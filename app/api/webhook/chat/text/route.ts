import { groqChatCompletion, isGroqCloneEnabled } from "@/lib/clone/groq";
import { saveConversationToSupabase } from "@/lib/supabase/conversations";
import { buildSystemPrompt, getCloneSettings } from "@/lib/supabase/poc-config";

type TextPayload = {
  session_id?: string;
  message?: string;
  channel?: string;
  user_name?: string;
};

export async function POST(request: Request) {
  if (!isGroqCloneEnabled()) {
    return Response.json(
      { success: false, error: "GROQ_API_KEY is not configured" },
      { status: 400 }
    );
  }

  let body: TextPayload;
  try {
    body = (await request.json()) as TextPayload;
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const sessionId = body.session_id?.trim() || crypto.randomUUID();
  const message = body.message?.trim();
  const channel = body.channel?.trim() || "web";
  const userName = body.user_name?.trim() || "Utilisateur";

  if (!message) {
    return Response.json(
      { success: false, error: "message is required" },
      { status: 422 }
    );
  }

  try {
    const cloneSettings = await getCloneSettings();
    const systemContent = await buildSystemPrompt({ mode: "text" });
    const response = await groqChatCompletion(
      [
        {
          role: "system",
          content: systemContent,
        },
        {
          role: "user",
          content: `[session:${sessionId}][channel:${channel}][name:${userName}] ${message}`,
        },
      ],
      cloneSettings.groqChatModel
    );

    try {
      await saveConversationToSupabase({
        sessionId,
        userName,
        userMessage: message,
        botResponse: response,
        channel,
      });
    } catch (error) {
      console.error("Failed to save webhook text conversation", error);
    }

    return Response.json({
      success: true,
      response,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Webhook text error", error);
    return Response.json(
      { success: false, error: "text generation failed" },
      { status: 502 }
    );
  }
}
