import { agentVocalFetch, isAgentVocalEnabled } from "@/lib/backend/agentvocal";

export async function POST(request: Request) {
  if (!isAgentVocalEnabled()) {
    return Response.json(
      { error: "AGENTVOCAL_API_BASE_URL and AGENTVOCAL_API_KEY must be configured" },
      { status: 400 }
    );
  }

  try {
    const formData = await request.formData();
    const response = await agentVocalFetch("/rag/documents/upload", {
      method: "POST",
      body: formData,
    });

    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    });
  } catch {
    return Response.json({ error: "RAG file upload failed" }, { status: 502 });
  }
}
