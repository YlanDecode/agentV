import { proxyVoiceChatRequest } from "@/lib/backend/agentvocal";

export async function POST(request: Request) {
  try {
    return await proxyVoiceChatRequest(request);
  } catch (error) {
    console.error("Webhook voice error", error);
    return Response.json({ error: "voice processing failed" }, { status: 502 });
  }
}
