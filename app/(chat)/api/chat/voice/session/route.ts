import { auth } from "@/app/(auth)/auth";
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
    const session = await auth();
    const payload = await createVoiceWsSession();
    return Response.json({
      ...payload,
      userId: session?.user?.id ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice session init failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
