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

export async function GET(_req: Request, { params }: Params) {
  if (!isAgentVocalEnabled()) return NOT_CONFIGURED;
  const { id } = await params;
  try {
    return forward(await agentVocalFetch(`/api/voices/${id}/consent`));
  } catch {
    return Response.json({ error: "Consent fetch failed" }, { status: 502 });
  }
}

export async function POST(req: Request, { params }: Params) {
  if (!isAgentVocalEnabled()) return NOT_CONFIGURED;
  const { id } = await params;
  try {
    const body = await req.json();
    return forward(
      await agentVocalFetch(`/api/voices/${id}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  } catch {
    return Response.json({ error: "Consent grant failed" }, { status: 502 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  if (!isAgentVocalEnabled()) return NOT_CONFIGURED;
  const { id } = await params;
  try {
    return forward(await agentVocalFetch(`/api/voices/${id}/consent`, { method: "DELETE" }));
  } catch {
    return Response.json({ error: "Consent revocation failed" }, { status: 502 });
  }
}
