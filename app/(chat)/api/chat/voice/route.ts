import { auth } from "@/app/(auth)/auth";
import { proxyVoiceChatRequest } from "@/lib/backend/agentvocal";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const session = await auth();
    return await proxyVoiceChatRequest(request, { userId: session?.user?.id ?? null });
  } catch (error) {
    console.error("Voice API error", error);
    return Response.json({ error: "Voice request failed" }, { status: 502 });
  }
}
