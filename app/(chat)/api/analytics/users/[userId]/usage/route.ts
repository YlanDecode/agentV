import { agentVocalFetch, isAgentVocalEnabled } from '@/lib/backend/agentvocal';

type UserUsageRouteParams = {
  params: { userId: string } | Promise<{ userId: string }>;
};

export async function GET(request: Request, context: UserUsageRouteParams) {
  if (!isAgentVocalEnabled()) {
    return Response.json(
      { error: 'AGENTVOCAL_API_BASE_URL and AGENTVOCAL_API_KEY must be configured' },
      { status: 400 }
    );
  }

  const params = await Promise.resolve(context.params);
  const userId = (params.userId || '').trim();
  if (!userId) {
    return Response.json({ error: 'user_id is required' }, { status: 400 });
  }

  const url = new URL(request.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days') || 14)));

  try {
    const response = await agentVocalFetch(`/analytics/users/${encodeURIComponent(userId)}/usage?days=${days}`);
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch {
    return Response.json(
      { error: "Impossible de charger l'usage détaillé de cet utilisateur." },
      { status: 502 }
    );
  }
}
