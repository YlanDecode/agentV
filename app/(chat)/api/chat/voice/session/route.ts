import { createVoiceWsSession, isAgentVocalEnabled } from "@/lib/backend/agentvocal";

export async function POST() {
  if (!isAgentVocalEnabled()) {
    return Response.json(
      {
        error:
          "AGENTVOCAL_API_BASE_URL and AGENTVOCAL_API_KEY must be configured",
      },
      { status: 400 }
    );
  }

  try {
    return Response.json(await createVoiceWsSession());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice session init failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
