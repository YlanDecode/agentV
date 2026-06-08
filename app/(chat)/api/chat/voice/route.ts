import { proxyVoiceChatRequest } from "@/lib/backend/agentvocal";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    return await proxyVoiceChatRequest(request);
  } catch (error) {
    console.error("Voice API error", error);
    return Response.json({ error: "Voice request failed" }, { status: 502 });
  }
}
