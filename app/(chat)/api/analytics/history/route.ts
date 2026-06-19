import { agentVocalFetch, isAgentVocalEnabled } from '@/lib/backend/agentvocal';

export async function GET(request: Request) {
  if (!isAgentVocalEnabled()) {
    return Response.json(
      { error: 'AGENTVOCAL_API_BASE_URL and AGENTVOCAL_API_KEY must be configured' },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days') || 14)));

  try {
    const response = await agentVocalFetch(`/analytics/history?days=${days}`);
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch {
    return Response.json(
      { error: "Impossible de charger l'historique analytics AgentVOCAL." },
      { status: 502 }
    );
  }
}
