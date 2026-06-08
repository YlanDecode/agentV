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
      return Response.json({ error: "Voice deletion failed" }, { status: response.status });
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Voice deletion failed" }, { status: 502 });
  }
}
