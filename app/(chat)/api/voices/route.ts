import { agentVocalFetch, isAgentVocalEnabled } from "@/lib/backend/agentvocal";

export async function GET() {
  if (!isAgentVocalEnabled()) {
    return Response.json(
      {
        error:
          'AGENTVOCAL_API_BASE_URL et AGENTVOCAL_API_KEY doivent être configurés pour charger les voix.',
      },
      { status: 400 }
    );
  }

  try {
    const response = await agentVocalFetch("/api/voices");
    const payload = await response.text();
    return new Response(payload, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch {
    return Response.json(
      { error: 'Impossible de charger les voix depuis le backend AgentVOCAL.' },
      { status: 502 }
    );
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
    return Response.json(
      { error: 'Impossible de téléverser cet échantillon vocal vers AgentVOCAL.' },
      { status: 502 }
    );
  }
}
