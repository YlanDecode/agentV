import { agentVocalFetch, isAgentVocalEnabled } from '@/lib/backend/agentvocal';

type SessionRouteParams = {
  params: { sessionId: string } | Promise<{ sessionId: string }>;
};

export async function GET(_request: Request, context: SessionRouteParams) {
  if (!isAgentVocalEnabled()) {
    return Response.json(
      { error: 'AGENTVOCAL_API_BASE_URL and AGENTVOCAL_API_KEY must be configured' },
      { status: 400 }
    );
  }

  const params = await Promise.resolve(context.params);
  const sessionId = (params.sessionId || '').trim();
  if (!sessionId) {
    return Response.json({ error: 'session_id is required' }, { status: 400 });
  }

  try {
    const response = await agentVocalFetch(`/analytics/sessions/${encodeURIComponent(sessionId)}`);
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch {
    return Response.json(
      { error: 'Impossible de charger le détail de la session.' },
      { status: 502 }
    );
  }
}
