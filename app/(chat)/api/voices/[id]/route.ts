import { agentVocalFetch, isAgentVocalEnabled } from "@/lib/backend/agentvocal";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
    const response = await agentVocalFetch(`/api/voices/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const body = await response.text();
      return new Response(body, {
        status: response.status,
        headers: {
          "Content-Type": response.headers.get("Content-Type") ?? "application/json",
        },
      });
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: 'Impossible de supprimer cette voix côté AgentVOCAL.' },
      { status: 502 }
    );
  }
}
