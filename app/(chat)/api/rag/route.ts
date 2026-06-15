import { agentVocalFetch, isAgentVocalEnabled } from "@/lib/backend/agentvocal";

const NOT_CONFIGURED = Response.json(
  { error: "AGENTVOCAL_API_BASE_URL and AGENTVOCAL_API_KEY must be configured" },
  { status: 400 }
);

export async function GET() {
  if (!isAgentVocalEnabled()) return Response.json({ items: [] });
  try {
    const response = await agentVocalFetch("/rag/documents");
    if (!response.ok) return Response.json({ items: [] });
    return Response.json(await response.json());
  } catch {
    return Response.json({ items: [] });
  }
}

export async function POST(request: Request) {
  if (!isAgentVocalEnabled()) return NOT_CONFIGURED;
  try {
    const contentType = request.headers.get("Content-Type") ?? "";
    const isMultipart = contentType.includes("multipart/form-data");

    const response = await agentVocalFetch("/rag/documents", {
      method: "POST",
      ...(isMultipart
        ? { body: await request.formData() }
        : {
            headers: { "Content-Type": "application/json" },
            body: await request.text(),
          }),
    });

    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    });
  } catch {
    return Response.json({ error: "RAG document creation failed" }, { status: 502 });
  }
}
