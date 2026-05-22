import { getCloneSettings } from "@/lib/supabase/poc-config";

export async function GET() {
  const headers = {
    "Cache-Control": "public, max-age=86400, s-maxage=86400",
  };

  const settings = await getCloneSettings();
  const modelId = `groq/${settings.groqChatModel}`;

  return Response.json(
    {
      capabilities: {
        [modelId]: { tools: false, vision: false, reasoning: false },
      },
      models: [
        {
          id: modelId,
          name: settings.groqChatModel,
          provider: "groq",
          description: "Configured clone model",
        },
      ],
    },
    { headers }
  );
}
