import { agentVocalFetch, isAgentVocalEnabled } from "@/lib/backend/agentvocal";

const NOT_CONFIGURED = Response.json(
  { error: "AGENTVOCAL_API_BASE_URL and AGENTVOCAL_API_KEY must be configured" },
  { status: 400 }
);

type Params = { params: Promise<{ id: string }> };

async function forward(response: Response): Promise<Response> {
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  if (!isAgentVocalEnabled()) return NOT_CONFIGURED;
  const { id } = await params;
  try {
    return forward(
      await agentVocalFetch(`/rag/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: await request.text(),
      })
    );
  } catch {
    return Response.json({ error: "RAG document update failed" }, { status: 502 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!isAgentVocalEnabled()) return NOT_CONFIGURED;
  const { id } = await params;
  try {
    return forward(await agentVocalFetch(`/rag/documents/${id}`, { method: "DELETE" }));
  } catch {
    return Response.json({ error: "RAG document deletion failed" }, { status: 502 });
  }
}
