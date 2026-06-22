import { agentVocalFetch, isAgentVocalEnabled } from '@/lib/backend/agentvocal';

export async function GET(request: Request) {
  if (!isAgentVocalEnabled()) {
    return Response.json(
      { error: 'AGENTVOCAL_API_BASE_URL and AGENTVOCAL_API_KEY must be configured' },
      { status: 400 }
    );
  }

  try {
    const search = new URL(request.url).searchParams.toString();
    const response = await agentVocalFetch(search ? `/analytics/dashboard?${search}` : '/analytics/dashboard');
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch {
    return Response.json(
      { error: 'Impossible de charger le dashboard analytics AgentVOCAL.' },
      { status: 502 }
    );
  }
}
