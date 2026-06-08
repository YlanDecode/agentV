import { agentVocalFetch, isAgentVocalEnabled } from "@/lib/backend/agentvocal";

export async function GET() {
  if (!isAgentVocalEnabled()) {
    return Response.json([]);
  }

  try {
    const response = await agentVocalFetch("/api/voices");
    if (!response.ok) {
      return Response.json([]);
    }

    return Response.json(await response.json());
  } catch {
    return Response.json([]);
  }
}

export async function POST(request: Request) {
  if (!isAgentVocalEnabled()) {
    return Response.json(
      {
        error:
          "AGENTVOCAL_API_BASE_URL and AGENTVOCAL_API_KEY must be configured",
      },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const audio = formData.get("audio") as File | null;

  if (!audio || audio.size === 0) {
    return Response.json({ error: "Audio manquant" }, { status: 400 });
  }

  try {
    const response = await agentVocalFetch("/api/voices", {
      method: "POST",
      body: formData,
    });

    const payload = await response.text();
    return new Response(payload, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch {
    return Response.json({ error: "Voice upload failed" }, { status: 502 });
  }
}
